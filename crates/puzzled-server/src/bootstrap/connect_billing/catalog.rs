use connectrpc::{Response, ServiceResult};

use super::BillingConnectService;
use crate::capabilities::money::pricing;
use crate::proto::puzzled::v1::{ListPlansResponse, Plan, PlanPrice};

pub(super) async fn list_plans(
    billing: &BillingConnectService,
) -> ServiceResult<ListPlansResponse> {
    let mut response = ListPlansResponse {
        sales_open: false,
        ..Default::default()
    };
    let Some(money) = &billing.state.money else {
        return Response::ok(response);
    };
    // Prices are Money's `catalogs/default`; nothing is priced here.
    // Money unreachable: no plans and sales closed ("Purchases open
    // shortly"), never an error page.
    let Ok(catalog) = money.catalog().await else {
        return Response::ok(response);
    };
    let sold = pricing::plans(&catalog);
    // The family size is the catalogue's `seats` limit, not a number
    // written here.
    response.family_max_members = sold
        .iter()
        .filter(|plan| plan.family)
        .map(|plan| plan.seats)
        .max()
        .unwrap_or(0);
    response.plans = sold
        .into_iter()
        .map(|plan| Plan {
            id: plan.plan_id,
            family: plan.family,
            interval: plan.interval,
            trial_days: i32::try_from(plan.trial_days).unwrap_or(0),
            access_days: i32::try_from(plan.access_days).unwrap_or(0),
            prices: plan
                .prices
                .into_iter()
                .map(|(currency, unit_amount_minor)| PlanPrice {
                    currency,
                    unit_amount_minor,
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        })
        .collect();
    response.sales_open = !response.plans.is_empty();
    Response::ok(response)
}
