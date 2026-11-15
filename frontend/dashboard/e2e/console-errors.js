// Runs before the dashboard's own scripts in every page: keeps what would show as an error in the browser
// console (console.error, an uncaught error or rejection, a resource that failed to load, a blocked
// Content-Security-Policy) in window.__e2eErrors, which the tests read.
(() => {
  const errors = (window.__e2eErrors = []);
  const keep = text => errors.push(String(text).slice(0, 500));
  const original = console.error.bind(console);
  console.error = (...args) => { keep(args.map(a => (a && a.stack) || String(a)).join(' ')); original(...args); };
  window.addEventListener('error', e => {
    const el = e.target;
    if (el && el !== window && (el.src || el.href)) keep(`failed to load ${el.src || el.href}`);
    else keep(`uncaught: ${e.message}`);
  }, true);
  window.addEventListener('unhandledrejection', e => keep(`unhandled rejection: ${(e.reason && e.reason.message) || e.reason}`));
  document.addEventListener('securitypolicyviolation', e => keep(`csp blocked ${e.blockedURI} (${e.violatedDirective})`));
})();
