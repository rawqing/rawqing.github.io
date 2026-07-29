// 文章目录（TOC）：扫描正文 h2/h3 自动生成右侧导航，支持点击平滑滚动与滚动高亮
// 同时：左侧分类导航（.site-sidebar）与右侧章节 TOC（#post-toc）在头图区域内淡出，避免遮挡封面
$(function () {
  var $post = $(".markdown-body");
  if (!$post.length) return;
  var $toc = $("#post-toc");
  if (!$toc.length) return;

  // 头图（.post-header）可见时隐藏左右两侧导航，滚过封面后再显示
  var $header = $(".post-header");
  var $sidebar = $(".site-sidebar");
  var headerBottom = $header.length ? $header.offset().top + $header.outerHeight() : 0;
  function updateVisibility() {
    var inHeader = !!(headerBottom && $(window).scrollTop() < headerBottom - 80);
    $sidebar.toggleClass("toc-hidden", inHeader);
    $toc.toggleClass("toc-hidden", inHeader);
  }

  var $headers = $post.find("h2, h3");
  if ($headers.length < 2) {
    $toc.hide(); // 章节过少不显示右侧目录，但左侧分类导航仍受头图显隐控制
  } else {
    var $list = $('<ul class="toc-list"></ul>');
    var items = [];
    $headers.each(function (i, el) {
      var $el = $(el);
      var id = $el.attr("id");
      if (!id) { id = "toc-" + i; $el.attr("id", id); }
      var tag = el.tagName.toLowerCase(); // h2 / h3
      var $li = $('<li class="toc-' + tag + '"></li>');
      var $a = $('<a href="#' + id + '"></a>').text($el.text());
      $li.append($a);
      $list.append($li);
      items.push({ el: el, $a: $a });
    });
    $toc.append($list);

    // 点击平滑滚动（预留顶部导航高度）
    $list.on("click", "a", function (e) {
      e.preventDefault();
      var id = $(this).attr("href").slice(1);
      var $target = $("#" + id);
      if ($target.length) {
        $("html, body").animate({ scrollTop: $target.offset().top - 70 }, 300);
      }
    });

    // 滚动高亮当前章节
    function onScroll() {
      var scrollTop = $(window).scrollTop() + 80;
      var current = null;
      for (var i = 0; i < items.length; i++) {
        if ($(items[i].el).offset().top <= scrollTop) current = items[i];
        else break;
      }
      items.forEach(function (it) { it.$a.removeClass("active"); });
      if (current) current.$a.addClass("active");
      updateVisibility();
    }
    $(window).on("scroll", onScroll);
    $(window).on("resize", function () {
      // 窗口尺寸变化时重新计算头图高度
      if ($header.length) headerBottom = $header.offset().top + $header.outerHeight();
      updateVisibility();
    });
    onScroll();
  }
});
