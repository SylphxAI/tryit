/// JS `seededRandom` over a double seed (exact `ToInt32` for any magnitude).
pub(super) struct JsLcg {
    pub(super) state: f64,
}

fn to_int32(value: f64) -> u32 {
    if !value.is_finite() {
        return 0;
    }
    let modulus = 4_294_967_296.0_f64;
    value.trunc().rem_euclid(modulus) as u32
}

impl JsLcg {
    pub(super) fn next_f64(&mut self) -> f64 {
        let product = self.state * 1_103_515_245.0 + 12_345.0;
        let masked = to_int32(product) & 0x7fff_ffff;
        self.state = f64::from(masked);
        self.state / 2_147_483_647.0
    }
}
