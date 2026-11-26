pub fn reminder_payload(locale: &str) -> serde_json::Value {
    let (title, body, url) = match locale {
        "zh-HK" => (
            "每日謎題準備好喇",
            "今日嘅謎題等緊你，幾分鐘就玩到。",
            "/zh-HK",
        ),
        "zh-TW" => (
            "每日謎題準備好了",
            "今天的謎題等著你，只需幾分鐘。",
            "/zh-TW",
        ),
        "zh-CN" => (
            "每日谜题准备好了",
            "今天的谜题等着你，只需几分钟。",
            "/zh-CN",
        ),
        "ja" => (
            "今日のパズルの準備ができました",
            "今日のパズルがあなたを待っています。数分で遊べます。",
            "/ja",
        ),
        "es" => (
            "Tu puzle diario está listo",
            "El puzle de hoy te está esperando. Solo te llevará unos minutos.",
            "/es",
        ),
        "pt-BR" => (
            "Seu quebra-cabeça diário está pronto",
            "O quebra-cabeça de hoje está esperando por você. Leva só alguns minutos.",
            "/pt-BR",
        ),
        "en-GB" => (
            "Your daily puzzle is ready",
            "Today's puzzle is waiting. It only takes a few minutes.",
            "/en-GB",
        ),
        _ => (
            "Your daily puzzle is ready",
            "Today's puzzle is waiting. It only takes a few minutes.",
            "/",
        ),
    };
    serde_json::json!({"title": title, "body": body, "url": url, "tag": "daily-puzzle"})
}
