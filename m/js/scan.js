/* =========================================================
   游雁学院 · 移动端扫码
   摄像头 + jsQR 解析二维码 -> 提取培训ID -> 进入培训详情
   依赖：页面已引入 jsQR（CDN）；无摄像头/非HTTPS时提供手动输入兜底
   ========================================================= */
(function () {
  'use strict';

  var stream = null;
  var rafId = null;
  var scanning = false;

  function buildOverlay() {
    if (document.getElementById('m-scan')) return;
    var el = document.createElement('div');
    el.className = 'm-scan';
    el.id = 'm-scan';
    el.innerHTML =
      '<div class="m-scan__bar">' +
        '<button class="m-scan__x" id="m-scan-close"><i class="fa-solid fa-xmark"></i></button>' +
        '<div style="color:#fff;font-weight:700;font-size:15px">扫码进入培训</div>' +
        '<div style="width:40px"></div>' +
      '</div>' +
      '<video class="m-scan__video" id="m-scan-video" playsinline muted></video>' +
      '<div class="m-scan__frame"><div class="m-scan__line"></div></div>' +
      '<div class="m-scan__tip" id="m-scan-tip">将培训二维码放入框内</div>' +
      '<button class="m-scan__manual" id="m-scan-manual">无法扫码？手动输入培训ID</button>' +
      '<div id="m-scan-manual-wrap" style="display:none;margin-top:8px;width:240px">' +
        '<input id="m-scan-input" class="m-input" style="margin-bottom:8px;background:#fff" placeholder="请输入培训ID">' +
        '<button class="m-btn m-btn--block" id="m-scan-submit">确定</button>' +
      '</div>';
    document.body.appendChild(el);

    document.getElementById('m-scan-close').addEventListener('click', stopScan);
    document.getElementById('m-scan-manual').addEventListener('click', function () {
      document.getElementById('m-scan-manual-wrap').style.display = 'block';
      document.getElementById('m-scan-input').focus();
    });
    document.getElementById('m-scan-submit').addEventListener('click', function () {
      var v = document.getElementById('m-scan-input').value.trim();
      handleResult(v);
    });
    document.getElementById('m-scan-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleResult(this.value.trim());
    });
  }

  function stopScan() {
    scanning = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    var ov = document.getElementById('m-scan');
    if (ov) ov.classList.remove('is-open');
  }

  function handleResult(text) {
    var id = window.Api ? Api.parseTrainingId(text) : null;
    if (!id) {
      if (window.App) App.toast('未识别到培训信息', 'error');
      return;
    }
    stopScan();
    var cur = location.pathname.split('/').pop();
    if (cur === 'training.html' && window.App && typeof App.openTraining === 'function') {
      App.openTraining(id);
    } else {
      location.href = '/m/training.html?id=' + encodeURIComponent(id);
    }
  }

  function tick() {
    if (!scanning) return;
    var video = document.getElementById('m-scan-video');
    var canvas = document.getElementById('m-scan-canvas');
    if (video && video.readyState >= 2 && canvas) {
      var w = video.videoWidth, h = video.videoHeight;
      if (w && h) {
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);
        try {
          var img = ctx.getImageData(0, 0, w, h);
          if (typeof jsQR !== 'undefined') {
            var code = jsQR(img.data, w, h);
            if (code && code.data) { handleResult(code.data); return; }
          }
        } catch (e) {}
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function startCamera() {
    var tip = document.getElementById('m-scan-tip');
    if (typeof jsQR === 'undefined') {
      if (tip) tip.textContent = '扫码组件未加载，请手动输入培训ID';
      document.getElementById('m-scan-manual-wrap').style.display = 'block';
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (tip) tip.textContent = '当前环境不支持摄像头，请手动输入培训ID';
      document.getElementById('m-scan-manual-wrap').style.display = 'block';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (s) {
        stream = s;
        var video = document.getElementById('m-scan-video');
        video.srcObject = s;
        video.setAttribute('playsinline', '');
        video.play();
        scanning = true;
        if (!document.getElementById('m-scan-canvas')) {
          var c = document.createElement('canvas');
          c.id = 'm-scan-canvas'; c.style.display = 'none';
          document.getElementById('m-scan').appendChild(c);
        }
        rafId = requestAnimationFrame(tick);
      })
      .catch(function (err) {
        if (tip) tip.textContent = '无法访问摄像头，请手动输入培训ID';
        document.getElementById('m-scan-manual-wrap').style.display = 'block';
      });
  }

  App.startScan = function () {
    buildOverlay();
    var ov = document.getElementById('m-scan');
    // 重置手动输入区
    document.getElementById('m-scan-manual-wrap').style.display = 'none';
    document.getElementById('m-scan-input').value = '';
    ov.classList.add('is-open');
    // 延迟启动相机，等过渡
    setTimeout(startCamera, 250);
  };

  // 确保全局可访问
  window.App = window.App || {};
  window.App.startScan = App.startScan;
})();
