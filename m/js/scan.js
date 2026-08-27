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
      '<button class="m-scan__manual" id="m-scan-manual">无法扫码？输入签到码</button>' +
      '<div id="m-scan-manual-wrap" style="display:none;margin-top:8px;width:240px">' +
        '<input id="m-scan-input" class="m-input" style="margin-bottom:8px;background:#fff;text-align:center;letter-spacing:0.3em" placeholder="请输入 4 位签到码" inputmode="numeric" maxlength="4">' +
        '<button class="m-btn m-btn--block" id="m-scan-submit">签到</button>' +
      '</div>';
    document.body.appendChild(el);

    document.getElementById('m-scan-close').addEventListener('click', stopScan);
    document.getElementById('m-scan-manual').addEventListener('click', function () {
      showManual();
    });
    document.getElementById('m-scan-submit').addEventListener('click', function () {
      var v = document.getElementById('m-scan-input').value.trim();
      handleManualCode(v);
    });
    document.getElementById('m-scan-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleManualCode(this.value.trim());
    });
  }

  function stopScan() {
    scanning = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    var ov = document.getElementById('m-scan');
    if (ov) ov.classList.remove('is-open');
  }

  // 显示手动输入区并聚焦（摄像头不可用 / 用户主动点“手动输入”时调用）
  function showManual() {
    var wrap = document.getElementById('m-scan-manual-wrap');
    if (wrap) {
      wrap.style.display = 'block';
      var input = document.getElementById('m-scan-input');
      if (input) {
        // 延迟聚焦，等布局稳定（移动端键盘弹起更可靠）
        setTimeout(function () { input.focus(); }, 60);
      }
    }
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

  // 手动输入 4 位签到码：解析培训并直接完成签到（移动端输码签到）
  function handleManualCode(code) {
    if (!/^\d{4}$/.test(code)) {
      if (window.App) App.toast('请输入 4 位数字签到码', 'error');
      return;
    }
    if (!window.Api || !window.App) return;
    if (typeof App.showLoading === 'function') App.showLoading('签到中...');
    Api.trainingBySignin(code)
      .then(function (r) {
        if (!r || !r.success || !r.event) {
          if (typeof App.hideLoading === 'function') App.hideLoading();
          App.toast('签到码无效或培训不存在', 'error');
          return;
        }
        var ev = r.event;
        Api.signin(ev.id, App.userId(), ev.signinId)
          .then(function () {
            if (typeof App.hideLoading === 'function') App.hideLoading();
            App.toast('签到成功');
            // 进入培训详情页（已签到，可继续完成调研/考试）
            location.href = '/m/training.html?id=' + encodeURIComponent(ev.id);
          })
          .catch(function (err) {
            if (typeof App.hideLoading === 'function') App.hideLoading();
            App.toast((err && err.message) || '签到失败', 'error');
          });
      })
      .catch(function () {
        if (typeof App.hideLoading === 'function') App.hideLoading();
        App.toast('签到码无效或培训不存在', 'error');
      });
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
      showManual();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (tip) tip.textContent = '当前环境不支持摄像头，请手动输入培训ID';
      showManual();
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
        showManual();
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
