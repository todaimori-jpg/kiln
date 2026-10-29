/* Kiln — xr.js : immersive-vr output. Presents the network's Output TOP to a headset as a
   flat panel, one letterboxed copy per eye. Stereo 3D (rendering the scene per-eye from a VR
   camera) is not implemented; this shows the same flat image the Output flag produces. */
(function () {
  'use strict';
  const K = window.K, E = K.gl;

  const X = (K.xr = { supported: false, session: null });

  // Feature detection is async, so the menus read support status when they open.
  if (window.navigator && navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { X.supported = !!ok; }).catch(() => {});
  }

  function presentEye(tex, fb, vp) {
    // E.pass binds target.fbo, so a plain object stands in for a render target here.
    E.pass(E.copyProg, {
      sIn0: tex,
      uIn0Res: [tex.w, tex.h],
      uRes: [vp.width, vp.height],
      uMode: 1,                       // fit — letterbox inside the eye viewport
      uBg: [0, 0, 0, 1],
      uChecker: 0,
    }, { fbo: fb, w: vp.width, h: vp.height }, [vp.x, vp.y, vp.width, vp.height]);
  }

  async function start() {
    if (X.session) return;
    if (!X.supported) { K.toast('This browser does not offer immersive VR'); return; }
    const gl = E.gl;
    let session;
    try {
      if (gl.makeXRCompatible) await gl.makeXRCompatible();
      session = await navigator.xr.requestSession('immersive-vr');
    } catch (e) {
      K.toast('Could not start VR: ' + ((e && e.message) || e));
      return;
    }
    X.session = session;
    let layer, refSpace;
    try {
      layer = new XRWebGLLayer(session, gl);
      session.updateRenderState({ baseLayer: layer });
      refSpace = await session.requestReferenceSpace('local');
    } catch (e) {
      X.session = null;
      try { session.end(); } catch (e2) {}
      K.toast('VR setup failed: ' + ((e && e.message) || e));
      return;
    }

    session.addEventListener('end', () => { X.session = null; K.toast('VR output stopped'); });

    session.requestAnimationFrame(function onFrame(t, frame) {
      session.requestAnimationFrame(onFrame);
      const pose = frame.getViewerPose(refSpace);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.viewport(0, 0, layer.framebufferWidth, layer.framebufferHeight);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!pose) return;
      // The page's own loop advances time and cooks; cook() is frame-cached, so this is a
      // lookup rather than a re-render when that loop has already run this frame.
      const op = K.viewer.outputOp();
      const tex = op ? K.cook(op) : null;
      if (!tex || !tex.w) return;
      for (const view of pose.views) {
        const vp = layer.getViewport(view);
        if (vp) presentEye(tex, layer.framebuffer, vp);
      }
    });

    K.toast('VR output on — showing the Output TOP');
  }

  function stop() { if (X.session) X.session.end(); }

  X.toggle = function () { X.session ? stop() : start(); };
})();
