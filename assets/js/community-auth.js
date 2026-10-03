(() => {
  let turnstilePromise;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!turnstilePromise)
      turnstilePromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const timer = setTimeout(() => {
          script.remove();
          turnstilePromise = null;
          reject(new Error("人机验证加载超时，请关闭表单后重试。"));
        }, 15000);
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = () => {
          clearTimeout(timer);
          if (window.turnstile) resolve(window.turnstile);
          else {
            turnstilePromise = null;
            reject(new Error("人机验证暂不可用。"));
          }
        };
        script.onerror = () => {
          clearTimeout(timer);
          script.remove();
          turnstilePromise = null;
          reject(new Error("无法加载人机验证，请检查网络后重新打开表单。"));
        };
        document.head.append(script);
      });
    return turnstilePromise;
  }
  window.WCLoadTurnstile = loadTurnstile;
})();
