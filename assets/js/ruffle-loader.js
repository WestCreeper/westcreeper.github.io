(() => {
  "use strict";
  const shell = document.querySelector("[data-player-shell]");
  if (!shell) return;
  const mount = shell.querySelector("[data-player-mount]");
  const launch = shell.querySelector("[data-player-launch]");
  const start = shell.querySelector("[data-player-start]");
  const restart = shell.querySelector("[data-player-restart]");
  const fullscreen = shell.querySelector("[data-player-fullscreen]");
  const message = document.querySelector("[data-player-message]");
  let player;
  let busy = false;
  let runtimePromise;
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error("模拟器下载超时"));
      }, 20000);
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("模拟器下载失败"));
      };
      document.head.appendChild(script);
    });
  const loadRuntime = async () => {
    if (window.RufflePlayer && window.RufflePlayer.newest) return;
    if (!runtimePromise) {
      window.RufflePlayer = window.RufflePlayer || {};
      window.RufflePlayer.config = {
        autoplay: "on",
        allowScriptAccess: false,
        backgroundColor: "#121b16",
        letterbox: "on",
      };
      runtimePromise = loadScript(shell.dataset.ruffleSrc)
        .catch(() =>
          loadScript("https://unpkg.com/@ruffle-rs/ruffle@0.6.0/ruffle.js"),
        )
        .catch((error) => {
          runtimePromise = null;
          throw error;
        });
    }
    await runtimePromise;
    if (!window.RufflePlayer.newest) throw new Error("模拟器未能初始化");
  };
  const boot = async () => {
    if (busy) return;
    busy = true;
    start.disabled = true;
    restart.disabled = true;
    start.textContent = "正在加载…";
    message.textContent = "正在加载模拟器与游戏资源，请稍候…";
    let timer;
    try {
      await loadRuntime();
      if (player) player.remove();
      player = window.RufflePlayer.newest().createPlayer();
      player.setAttribute("aria-label", "Flash 游戏画面");
      mount.replaceChildren(player);
      mount.hidden = false;
      launch.hidden = true;
      const load = player.ruffle().load({
        url: shell.dataset.swf,
        base: new URL(".", new URL(shell.dataset.swf, document.baseURI)).href,
        autoplay: "on",
        allowScriptAccess: false,
        openUrlMode: "confirm",
        scale: "showAll",
        forceScale: true,
        salign: "",
        forceAlign: true,
      });
      await Promise.race([
        load,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("游戏加载超时")), 60000);
        }),
      ]);
      message.textContent =
        shell.dataset.playNote ||
        "游戏文件已加载。请点击画面后使用键盘操作；重新开始会清除当前这一局的进度。";
      restart.disabled = false;
      player.focus();
    } catch (error) {
      if (player) {
        player.remove();
        player = null;
      }
      mount.replaceChildren();
      mount.hidden = true;
      launch.hidden = false;
      start.textContent = "重试加载";
      message.textContent =
        "未能启动游戏，请检查网络后重试。若仍无法运行，可下载 SWF 使用本地播放器，或通过留言板反馈。";
      console.warn("Ruffle could not start:", error);
    } finally {
      clearTimeout(timer);
      busy = false;
      start.disabled = false;
    }
  };
  start.addEventListener("click", boot);
  restart.addEventListener("click", () => {
    if (confirm("重新开始会结束当前这一局，确定重新开始吗？")) boot();
  });
  if (!document.fullscreenEnabled || !shell.requestFullscreen) {
    fullscreen.hidden = true;
  } else {
    fullscreen.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === shell)
          await document.exitFullscreen();
        else await shell.requestFullscreen();
      } catch (_) {
        message.textContent = "当前浏览器无法进入全屏，请在页面内游玩。";
      }
    });
    document.addEventListener("fullscreenchange", () => {
      fullscreen.lastChild.textContent =
        document.fullscreenElement === shell ? "退出全屏" : "全屏";
    });
  }
})();
