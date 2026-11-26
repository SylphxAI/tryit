use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;

use super::super::client::Catalog;
use super::super::pricing::{plan, plans};
use super::{catalog_fixture, fake_money, fake_money_router, granted, parsed};

#[tokio::test]
async fn catalogue_reader_and_fixture_use_price_catalogs_and_refuse_old_route() {
    let (money, fake) = fake_money(200, granted()).await;
    assert!(
        money.catalog().await.is_ok(),
        "reader must reach the real collection"
    );
    let app = fake_money_router(fake);
    for (path, expected) in [
        (
            "/v1/orgs/o/projects/p/envs/e/price_catalogs/default",
            StatusCode::OK,
        ),
        (
            "/v1/orgs/o/projects/p/envs/e/catalogs/default",
            StatusCode::NOT_FOUND,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), expected, "{path}");
    }
}

#[tokio::test]
async fn pricing_is_derived_from_the_catalogue_fixture() {
    let (money, _) = fake_money(200, json!({})).await;
    let catalog = money.catalog().await.unwrap();
    let shown = plans(&catalog);
    let ids: Vec<&str> = shown.iter().map(|p| p.plan_id.as_str()).collect();
    // Individual (seats 1) before family, month before year; the product
    // without `plus` is not a plan.
    assert_eq!(
        ids,
        [
            "individual_monthly",
            "individual_yearly",
            "family_monthly",
            "family_yearly"
        ]
    );
    let first = &shown[0];
    assert_eq!(first.price_key, "k_solo_m");
    // Only the price Money publishes a trial for carries one.
    assert_eq!(first.trial_days, 0);
    assert_eq!(shown[1].trial_days, 7);
    assert_eq!(shown[3].trial_days, 0);
    assert_eq!(first.interval, "month");
    assert!(shown.iter().all(|plan| plan.access_days == 0));
    assert!(!first.family && shown[2].family && shown[2].seats == 4);
    assert_eq!(
        first.prices,
        vec![("gbp".to_string(), 1000), ("usd".to_string(), 1100)]
    );
}

#[test]
fn a_one_time_licence_pass_keeps_its_access_term() {
    let mut value = catalog_fixture(&[]);
    value["spec"]["products"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "key": "weekend", "features": {"plus": "true", "seats": "1"},
            "licence": {"scheme": "sylphx-offline-ed25519-v1", "plan": "plus",
                        "token_product": "puzzled", "key": "plus-key",
                        "term": {"unit": "days", "count": 3}},
            "prices": [{"key": "weekend_once", "unit_amounts": {"USD": "99", "GBP": "79"}}]
        }));
    let catalog = parsed(value);
    let pass = plan(&catalog, "individual_once").unwrap();
    assert_eq!(pass.price_key, "weekend_once");
    assert_eq!(pass.interval, "");
    assert_eq!(pass.access_days, 3);
    assert_eq!(pass.trial_days, 0);
    assert_eq!(pass.prices, vec![("gbp".into(), 79), ("usd".into(), 99)]);
}

#[test]
fn a_one_time_pass_without_a_positive_day_term_is_not_sold() {
    let mut value = catalog_fixture(&[]);
    value["spec"]["products"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "key": "bad-once", "features": {"plus": "true", "seats": "1"},
            "prices": [{"key": "bad_once", "unit_amounts": {"USD": "99"}}]
        }));
    assert!(plan(&parsed(value.clone()), "individual_once").is_none());

    let product_index = value["spec"]["products"].as_array().unwrap().len() - 1;
    value["spec"]["products"][product_index]["licence"] =
        json!({"term": {"unit": "days", "count": 0}});
    assert!(plan(&parsed(value.clone()), "individual_once").is_none());
    value["spec"]["products"][product_index]["licence"] =
        json!({"term": {"unit": "months", "count": 3}});
    assert!(plan(&parsed(value), "individual_once").is_none());
}

#[test]
fn an_archived_or_unpriced_price_is_not_sold() {
    let archived = parsed(catalog_fixture(&["k_fam_y"]));
    assert_eq!(plans(&archived).len(), 3);
    assert!(plan(&archived, "family_yearly").is_none());
    assert!(plan(&archived, "family_monthly").is_some());
    let mut weekly = catalog_fixture(&[]);
    weekly["spec"]["products"][1]["prices"][0]["recurring_interval"] = json!("week");
    assert!(plan(&parsed(weekly), "individual_monthly").is_none());
    assert!(plans(&Catalog::default()).is_empty());
}
