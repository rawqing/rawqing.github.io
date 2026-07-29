// 夜间模式手动切换：记忆用户偏好到 localStorage，并同步评论区（utterances）主题
$(function () {
  var KEY = "nightMode";
  // 仅当站点配置 nightMode 为 true 时启用切换
  if ($("#nm-switch").val() !== "true") return;

  var $body = $("body");
  var $toggle = $("#nm-toggle");

  // 初始化：优先读取用户偏好；无偏好则保持浅色（覆盖主题默认的“仅深夜自动变暗”）
  var pref = localStorage.getItem(KEY);
  if (pref === "true") {
    $body.addClass("night-mode");
  } else {
    $body.removeClass("night-mode");
  }

  // 同步评论区主题：夜间用 github-dark，白天用 github-light
  function setUtterancesTheme() {
    var frame = document.querySelector(".utterances-frame");
    if (!frame || !frame.contentWindow) return;
    var theme = $body.hasClass("night-mode") ? "github-dark" : "github-light";
    frame.contentWindow.postMessage({ type: "set-theme", theme: theme }, "https://utteranc.es");
  }
  // utterances 加载完成后向父窗口发送 {type:'ready'}，借此在加载完毕时校正一次主题
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://utteranc.es") return;
    if (e.data && e.data.type === "ready") setUtterancesTheme();
  });

  function syncIcon() {
    var isNight = $body.hasClass("night-mode");
    $toggle.text(isNight ? "☀" : "☾"); // 夜间显示太阳（点击回白天），白天显示月亮
    $toggle.attr("title", isNight ? "切换到白天" : "切换到夜间");
  }
  syncIcon();

  $toggle.on("click", function (e) {
    e.preventDefault();
    $body.toggleClass("night-mode");
    localStorage.setItem(KEY, $body.hasClass("night-mode") ? "true" : "false");
    syncIcon();
    setUtterancesTheme(); // 评论区已加载则即时切换；加载中则待 ready 时校正
  });
});
