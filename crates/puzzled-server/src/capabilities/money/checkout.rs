//! Checkout: the server creates a Money `checkout_session` and the browser is
//! redirected to its hosted page. The success page grants nothing; access
//! arrives through Money's entitlement check once the processor confirms.

mod consent;
mod payload;
mod session;

pub use consent::{
    checkout_locale, locale_prefix, safe_return_to, CheckoutError, Consent, GuestCheckoutSession,
};
pub use payload::{guest_session_body, session_body};
pub(crate) use session::{create_guest_session, create_retained_session, create_session};
