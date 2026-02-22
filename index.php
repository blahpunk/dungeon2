<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DungeonPunk!</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }

      html, body { height: 100%; }
      body {
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial;
        background: #0b0e14;
        color: #e6e6e6;

        display: grid;
        grid-template-rows: auto 1fr;
        min-height: 100vh;
        overflow: auto; /* allow page scroll */
      }

      header {
        padding: 10px 12px;
        border-bottom: 1px solid #1e2533;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      header .title { font-weight: 800; letter-spacing: 0.3px; margin-right: 8px; }
      #headerInfo {
        margin-left: auto;
        text-align: right;
        font-size: 12px;
        line-height: 1.25;
        opacity: 0.9;
        white-space: nowrap;
      }
      #debugMenuWrap {
        position: relative;
      }
      #debugMenu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 210px;
        background: #101a2b;
        border: 1px solid #27314a;
        border-radius: 10px;
        padding: 8px 10px;
        display: none;
        z-index: 1800;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
      }
      #debugMenu.show {
        display: block;
      }
      .debugToggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        padding: 6px 2px;
        cursor: pointer;
        user-select: none;
      }
      .debugToggle input {
        width: 16px;
        height: 16px;
        accent-color: #5ca7ff;
      }
      button {
        background: #182032;
        color: #e6e6e6;
        border: 1px solid #27314a;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
      }
      button:hover { filter: brightness(1.1); }
      .meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        opacity: 0.95;
        font-size: 13px;
        white-space: pre;
        background: transparent;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        pointer-events: none;
      }
      .meta .meta-seed, .meta .meta-pos { opacity: 0.9; font-size: 12px; }
      .meta .meta-row { display: flex; gap: 12px; margin-top: 6px; justify-content: flex-end; }
      .meta .meta-col { display: flex; gap: 8px; align-items: baseline; min-width: 64px; justify-content: flex-end; }
      .meta .meta-col .label { opacity: 0.85; font-weight: 700; font-size: 13px; }
      .meta .meta-col .val { color: #fff; font-weight: 900; font-size: 15px; margin-left: 6px; }

      /* HP low flashing */
      .meta .val.hp.hp-low, #vitalsDisplay .hp.hp-low { color: #ff6b6b; animation: hp-pulse 1s ease-in-out infinite; }
      @keyframes hp-pulse {
        0%,100% { text-shadow: 0 0 0 rgba(255,107,107,0.0); transform: scale(1); }
        50% { text-shadow: 0 0 8px rgba(255,107,107,0.9); transform: scale(1.03); }
      }

      /* MAIN 2-COLUMN LAYOUT */
      #wrap {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr 380px;
        gap: 12px;
        padding: 10px;
        overflow: visible;
        align-items: stretch;
      }

      /* LEFT COLUMN: dungeon view (maximized) */
      #leftCol {
        min-height: 0;
        display: grid;
        grid-template-rows: 1fr;
        gap: 10px;
        overflow: visible;
      }

      /* Main canvas container: center a square canvas that fills the available height */
      #mainCanvasWrap {
        min-height: 0;
        position: relative;
        display: flex;
        align-items: center;   /* center vertically */
        justify-content: center; /* center horizontally */
        overflow: visible; /* avoid internal scrollbars */
        border: 1px solid #27314a;
        border-radius: 12px;
        background: #070a10;
        padding: 8px;
      }

      canvas#c {
        display: block;
        image-rendering: auto;
        margin: 0;

        /* Default (mobile-first): keep previous square behavior. */
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        max-width: 100%;
        max-height: 100%;
        box-sizing: border-box;
        object-fit: contain;
      }

      /* Desktop: allow rectangular viewport to reveal more tiles as window grows. */
      @media (min-width: 761px) {
        canvas#c {
          width: 100%;
          height: 100%;
          aspect-ratio: auto;
          object-fit: contain;
        }
      }

      /* When the viewport is taller than it is wide (portrait), make the
         main view use the full available height and compute width from
         the 1:1 aspect so the canvas remains a full-size square. */
      @media (max-aspect-ratio: 1/1), (orientation: portrait) {
        canvas#c {
          width: auto;
          height: 100%;
        }
        /* Ensure the canvas container uses the full row height */
        #mainCanvasWrap { align-items: stretch; }
      }

      #logPanel {
        border: none;
        border-radius: 0;
        background: transparent;
        padding: 0;
        position: absolute;
        bottom: 12px;
        left: 12px;
        z-index: 1200;
        width: min(56%, 520px);
        max-width: calc(100% - 32px);
        pointer-events: auto;
      }
      #invOverlay {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 1300;
        max-width: min(42%, 420px);
        pointer-events: auto;
      }
      #invOverlay .panel { background: transparent; border: none; padding: 0; }
      #invOverlay h3 { margin: 0 0 6px 0; font-size: 13px; }
      #invSections {
        display: grid;
        gap: 4px;
      }
      .invSectionToggle {
        width: 100%;
        text-align: left;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 8px;
        background: rgba(20, 30, 48, 0.82);
        border: 1px solid #2b3956;
      }
      .invSectionBody.hidden {
        display: none;
      }

      #metaWrap { position: absolute; top: 12px; right: 12px; z-index: 1300; pointer-events: none; display:flex; flex-direction:column; align-items:flex-end }
      #logTitle { display: none; }
      #logTitle {
        font-weight: 700;
        margin: 0 0 6px 0;
      }

      #log {
        border: 1px solid #24304a;
        border-radius: 10px;
        padding: 10px;
        background: #070b12;
        /* a compact overlay height and scrollable */
        font-size: 13px;
        line-height: 1.35;
        height: calc(6 * 1.35em + 20px);
        overflow: auto;
        white-space: pre-wrap;
      }
      #deathOverlay {
        position: absolute;
        inset: 0;
        z-index: 1600;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        background: rgba(0, 0, 0, 0.55);
      }
      #deathOverlay.show {
        display: flex;
      }
      #shopOverlay {
        position: fixed;
        inset: 0;
        z-index: 1700;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.65);
        padding: 12px;
      }
      #shopOverlay.show {
        display: flex;
      }
      #shopCard {
        width: min(980px, 96vw);
        height: min(760px, 92vh);
        border: 1px solid #2a3450;
        border-radius: 12px;
        background: rgba(7, 11, 18, 0.98);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        overflow: hidden;
      }
      #shopHeader {
        padding: 12px 14px 8px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #shopTitle {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
      }
      #shopCloseBtn {
        min-width: 84px;
      }
      #shopMeta {
        padding: 8px 14px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        border-bottom: 1px solid #1f2a40;
      }
      #shopTabs {
        padding: 8px 14px;
        display: flex;
        gap: 8px;
        border-bottom: 1px solid #1f2a40;
      }
      .shopTab {
        min-width: 120px;
      }
      .shopTab.active {
        background: #25406f;
        border-color: #3f68a3;
      }
      #shopBody {
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 10px 14px;
      }
      .shopListWrap {
        border: 1px solid #24304a;
        border-radius: 10px;
        overflow: auto;
        padding: 6px;
      }
      .shopItemBtn {
        width: 100%;
        text-align: left;
        padding: 8px 10px;
        border-radius: 8px;
        margin-bottom: 6px;
        background: #101828;
        border: 1px solid #23314d;
      }
      .shopItemBtn:last-child {
        margin-bottom: 0;
      }
      .shopItemBtn.active {
        background: #223554;
        border-color: #4f79b7;
      }
      #shopDetail {
        border: 1px solid #24304a;
        border-radius: 10px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #shopDetailTitle {
        font-size: 16px;
        font-weight: 700;
      }
      #shopDetailBody {
        white-space: pre-wrap;
        font-size: 13px;
        opacity: 0.95;
      }
      #shopActionBtn {
        margin-top: auto;
      }
      #shopFooter {
        padding: 8px 14px 12px 14px;
        border-top: 1px solid #1f2a40;
        font-size: 12px;
        opacity: 0.86;
      }
      @media (max-width: 780px) {
        #shopBody {
          grid-template-columns: 1fr;
        }
      }
      #deathCard {
        min-width: min(92vw, 440px);
        max-width: min(92vw, 520px);
        padding: 18px 16px;
        border: 1px solid #2a3450;
        border-radius: 12px;
        background: rgba(7, 11, 18, 0.98);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        text-align: center;
      }
      #deathTitle {
        margin: 0 0 8px 0;
        font-size: 22px;
        font-weight: 800;
        color: #ffffff;
      }
      #deathText {
        margin: 0 0 14px 0;
        font-size: 13px;
        color: #c9d4e8;
      }
      #deathButtons {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }
      #deathButtons button {
        min-width: 130px;
      }
      #contextActionWrap {
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      #vitalsDisplay {
        margin-bottom: 8px;
        font-size: 18px;
        font-weight: 800;
        color: #ffffff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      }
      #vitalsDisplay .lbl {
        opacity: 0.9;
        margin-right: 6px;
        font-weight: 900;
      }
      #vitalsDisplay .sep {
        opacity: 0.65;
        margin: 0 10px;
      }
      #depthDisplay {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 800;
        line-height: 1.1;
        color: #f2f6ff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      }
      #contextActionBtn {
        width: auto;
        min-width: 180px;
        max-width: 100%;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      #contextPotionBtn {
        width: auto;
        min-width: 180px;
        max-width: 100%;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      #contextActionBtn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      #contextPotionBtn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      #contextAttackList {
        display: none;
        width: min(100%, 420px);
        gap: 6px;
        flex-direction: column;
      }
      #contextAttackList.grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .contextAttackBtn {
        width: auto;
        min-width: 180px;
        max-width: 100%;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      .contextBtnContent {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
      }
      .contextBtnIcon {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .contextBtnIcon img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .contextBtnGlyph {
        font-size: 16px;
        line-height: 1;
        font-weight: 800;
      }
      .contextBtnText {
        min-width: 0;
        line-height: 1.2;
      }
      #surfaceCompass {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 24px;
        height: 24px;
        z-index: 1450;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        transform: translate(-50%, -50%);
      }
      #surfaceCompassArrow {
        font-size: 16px;
        line-height: 1;
        color: #ff5a5a;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        transform-origin: 50% 55%;
      }

      /* RIGHT COLUMN */
      #rightCol {
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: visible;
      }

      /* Smooth transition for layout (panels are always visible) */
      #wrap { transition: grid-template-columns 220ms ease, padding 180ms ease; }

      #miniWrap {
        border: 1px solid #24304a;
        border-radius: 12px;
        padding: 10px;
        background: #070b12;
        flex: 0 0 auto;
      }
      #miniHeader {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 8px;
      }
      #miniHeader b { font-size: 14px; }
      #miniHeader span { opacity: 0.75; font-size: 12px; }

      /* IMPORTANT: do NOT stretch the minimap; keep it at native canvas pixel size */
      canvas#mini {
        display: block;
        margin: 0 auto;

        /* Allow the canvas to scale down responsively so it remains visible
           on narrow/mobile screens while keeping pixelated rendering. */
        max-width: 100%;
        width: 100%;
        height: auto;
        margin: 0 auto; /* center when there is extra space */
      }

      .legend {
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.35;
        opacity: 0.85;
      }
      .dot { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; vertical-align:middle; border:1px solid #1f2a40;}
      .dot.red { background:#ff6b6b; }
      .dot.blue { background:#6bb8ff; }
      .dot.green { background:#7dff6b; }
      .dot.shrine { background:#b8f2e6; }

      .panel {
        border: 1px solid #24304a;
        border-radius: 12px;
        padding: 10px;
        background: #070b12;
        flex: 0 0 auto;
        min-height: 0;
      }
      .panel h3 { margin: 0 0 8px 0; font-size: 14px; }

      #invList { display: grid; gap: 0; }
      #equipBadges {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin: 0 0 8px 0;
      }
      .equipSlot {
        display: grid;
        grid-template-rows: auto auto;
        align-items: start;
        gap: 3px;
        min-width: 0;
      }
      .equipBadge {
        border: 1px solid #2b3956;
        background: rgba(34, 48, 76, 0.9);
        border-radius: 12px;
        padding: 3px;
        min-height: 0;
        overflow: hidden;
      }
      .equipBadgeIcon {
        position: relative;
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        min-height: 0;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 30px;
        line-height: 1;
        color: #9fb4d8;
        overflow: hidden;
      }
      .equipBadgeIcon img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
      }
      .equipBadgeGlyph {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 30px;
        font-weight: 800;
        line-height: 1;
      }
      .equipBadgeLabel {
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.25px;
        color: #d6e4ff;
        opacity: 0.92;
        line-height: 1.15;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        width: 100%;
      }
      /* Inventory items are now direct buttons inside #invList */
      #invList > .invLabelBtn {
        display: block;
        width: 100%;
        text-align: left;
        padding: 0 4px;
        margin: 0;
        border: none;
        background: transparent; /* fully transparent */
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      #invList > .invLabelBtn:focus { outline: none; }
      .invRow {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .invIconWrap {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 20px;
      }
      .invIconWrap img {
        width: 20px;
        height: 20px;
        object-fit: contain;
        display: block;
      }
      .invIconGlyph {
        font-weight: 800;
        line-height: 1;
        font-size: 16px;
      }
      .invLabelText {
        min-width: 0;
      }
      .muted { opacity: 0.75; }

      /* Panels below minimap: scroll internally if needed */
      #rightScroll {
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-right: 2px;
      }

      #log {
        border: none;
        border-radius: 0;
        padding: 6px 8px;
        background: transparent;

        /* a compact overlay height and scrollable */
        font-size: 13px;
        line-height: 1.35;
        height: calc(6 * 1.35em + 20px);
        overflow: auto;
        white-space: pre-wrap;
      }

      /* Responsive fallback */
      @media (max-width: 980px) {
        body { overflow: auto; }
        #wrap {
          grid-template-columns: 1fr;
          height: auto;
          min-height: unset;
        }
        #leftCol, #rightCol { overflow: visible; }
      }

      /* Mobile touch controls (visible on small screens) */
      #touchControls { display: none; }
      @media (max-width: 760px) {
        body {
          background: #131c2b;
        }
        header {
          background: #162133;
          border-bottom-color: #2c3b57;
        }
        #mainCanvasWrap {
          background: #111a29;
          border-color: #324465;
        }
        canvas#c {
          filter: brightness(1.24) contrast(1.08) saturate(1.08);
        }
        #logPanel {
          background: rgba(14, 20, 32, 0.35);
          border-radius: 10px;
          padding: 4px;
        }

        /* Fixed to bottom-right: actions at left, D-pad at right */
        #touchControls {
          display: flex;
          position: fixed;
          right: 12px;
          left: auto;
          bottom: 12px;
          flex-direction: row-reverse;
          gap: 10px;
          align-items: center;
          pointer-events: auto;
          z-index: 1200;
          max-width: calc(100vw - 24px);
          flex-wrap: nowrap;
        }

        /* Ensure the canvas/log have space so controls stay visible */
        #mainCanvasWrap { padding-bottom: 140px; }
        #log { height: calc(6 * 1.35em + 12px); }

        /* D-pad: up centered above the middle row (left/center/right), down centered below */
        #dpad { display: flex; flex-direction: column; gap: 8px; align-items: center; }
        #dpad > div { display: flex; gap: 8px; justify-content: center; }

        /* Stack action buttons vertically so they sit to the left of the D-pad */
        #actions { display: flex; flex-direction: column; gap: 8px; align-items: center; }

        /* Table layout for touch controls: left = 3x3 D-pad, right = context buttons */
        #touchTable { display: block; }
        #touchTable table { border-collapse: collapse; }
        #touchTable td { vertical-align: middle; padding: 0 6px; }
        .control-grid { border-collapse: collapse; }
        .control-grid td { padding: 6px; }
        .context-buttons { display: flex; flex-direction: column; gap: 8px; }

        .dpad-btn {
          background: rgba(24,32,50,0.98);
          color: #e6e6e6;
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px;
          width: 64px;
          height: 64px;
          font-size: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
          padding: 6px;
        }
        .dpad-btn.center { width: 56px; height: 56px; border-radius: 50%; }
      }
    </style>
    <!-- Matomo -->
<script>
  var _paq = window._paq = window._paq || [];
  /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
  _paq.push(['trackPageView']);
  _paq.push(['enableLinkTracking']);
  (function() {
    var u="//anal.blahpunk.com/";
    _paq.push(['setTrackerUrl', u+'matomo.php']);
    _paq.push(['setSiteId', '7']);
    var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
    g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
  })();
</script>
<!-- End Matomo Code -->

  </head>

  <body>
    <header>
      <div class="title">DungeonPunk!</div>
      <button id="btnNew">New seed</button>
      <button id="btnFog">Toggle fog</button>
      <button id="btnReset">Hard reset</button>
      <button id="btnExport">Copy save</button>
      <button id="btnImport">Load save</button>
      <div id="debugMenuWrap">
        <button id="btnDebugMenu" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="debugMenu">Debug</button>
        <div id="debugMenu" aria-hidden="true">
          <label class="debugToggle" for="toggleGodmode">
            <span>Godmode</span>
            <input id="toggleGodmode" type="checkbox" />
          </label>
          <label class="debugToggle" for="toggleFreeShopping">
            <span>Free shopping</span>
            <input id="toggleFreeShopping" type="checkbox" />
          </label>
        </div>
      </div>
      <div id="headerInfo"></div>
    </header>

    <div id="wrap">
      <!-- LEFT COLUMN -->
      <div id="leftCol">
        <div id="mainCanvasWrap">
          <canvas id="c"></canvas>
          <div id="surfaceCompass" aria-hidden="true"><div id="surfaceCompassArrow">&#9650;</div></div>

          <div id="invOverlay">
            <div id="invPanel">
              <div class="panel" style="background:transparent;border:none;padding:0;">
                <div id="invSections">
                  <button id="equipSectionToggle" class="invSectionToggle" type="button" aria-expanded="true">Equipment -</button>
                  <div id="equipSectionBody" class="invSectionBody">
                    <div id="equipBadges">
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeWeapon"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelWeapon">Weapon</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeHead"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelHead">Head</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeTorso"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelTorso">Torso</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeLegs"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelLegs">Legs</div></div>
                    </div>
                  </div>
                  <button id="inventorySectionToggle" class="invSectionToggle" type="button" aria-expanded="true">Inventory -</button>
                  <div id="inventorySectionBody" class="invSectionBody">
                    <div id="invList"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="metaWrap">
            <div class="meta" id="meta"></div>
            <div id="metaExtras" style="margin-top:8px; text-align:right; pointer-events:none;">
              <div style="font-size:12px; opacity:0.9;">Effects</div>
              <div id="effectsText" class="muted" style="white-space:pre-wrap; font-size:13px;"></div>
            </div>
          </div>

          <div id="logPanel">
            <div id="logTitle">Message log</div>
            <div id="vitalsDisplay">HP: 0/0 | LVL: 1</div>
            <div id="contextActionWrap">
              <button id="contextActionBtn" type="button" title="Contextual action">No action</button>
              <button id="contextPotionBtn" type="button" title="Use potion" style="display:none;">Use Potion</button>
              <div id="contextAttackList"></div>
            </div>
            <div id="depthDisplay">Depth: 0</div>
            <div id="log"></div>
          </div>

          <div id="deathOverlay" aria-hidden="true">
            <div id="deathCard">
              <h2 id="deathTitle">You Died</h2>
              <p id="deathText">Respawn to continue this run, or start a new dungeon.</p>
              <div id="deathButtons">
                <button id="btnRespawn" type="button">Respawn</button>
                <button id="btnNewDungeon" type="button">New Dungeon</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div id="rightCol">
        <div id="miniWrap">
          <div id="miniHeader">
            <b>Minimap</b>
            <span>(M)</span>
          </div>
          <canvas id="mini"></canvas>
          <div class="legend">
            Locked doors need matching keys:
            <div style="margin-top:6px;">
              <span class="dot red"></span>Red &nbsp;
              <span class="dot blue"></span>Blue &nbsp;
              <span class="dot green"></span>Green &nbsp;|&nbsp;
              <span class="dot shrine"></span>Shrine
            </div>
          </div>
        </div>

        <div id="rightScroll">
          <div id="help">
            Move: <code>Arrow</code>/<code>WASD</code> &middot; Wait: <code>.</code>/<code>Space</code><br />
            Pickup: <code>G</code> &middot; Use/Equip: <code>1&ndash;9</code> &middot; Drop: <code>Shift+1&ndash;9</code> &middot; Inventory: <code>I</code><br />
            Doors: bump to open, <code>C</code> close adjacent open door<br />
            
            Interact shrine/take stairs: <code>E</code> &middot; Toggle minimap: <code>M</code> &middot; New run: <code>R</code>
          </div>
        </div>
      </div>
    </div>
    <div id="shopOverlay" aria-hidden="true">
      <div id="shopCard">
        <div id="shopHeader">
          <h2 id="shopTitle">Shopkeeper</h2>
          <button id="shopCloseBtn" type="button">Close</button>
        </div>
        <div id="shopMeta">
          <div id="shopGold">Gold: 0</div>
          <div id="shopRefresh">Refresh in --:--</div>
        </div>
        <div id="shopTabs">
          <button id="shopTabBuy" class="shopTab active" type="button">Buy</button>
          <button id="shopTabSell" class="shopTab" type="button">Sell</button>
        </div>
        <div id="shopBody">
          <div id="shopList" class="shopListWrap"></div>
          <div id="shopDetail">
            <div id="shopDetailTitle">Select an item</div>
            <div id="shopDetailBody">Tap an item to view details.</div>
            <button id="shopActionBtn" type="button" disabled>Choose</button>
          </div>
        </div>
        <div id="shopFooter">Buy and sell with tap-friendly controls. Sell value is 25% of listed item value.</div>
      </div>
    </div>

    <script type="module" src="./game.js"></script>
    <!-- Mobile touch controls (table: left = 3x3 directional, right = context buttons) -->
    <div id="touchControls" aria-hidden="false">
      <div id="touchTable">
        <table role="presentation">
          <tr>
            <td>
              <table class="control-grid" role="presentation">
                <tr>
                  <td></td>
                  <td><button class="dpad-btn" data-dx="0" data-dy="-1" title="Move Up">&#8593;</button></td>
                  <td></td>
                </tr>
                <tr>
                  <td><button class="dpad-btn" data-dx="-1" data-dy="0" title="Move Left">&#8592;</button></td>
                  <td><button class="dpad-btn center" data-dx="0" data-dy="0" title="Context Action">&#9673;</button></td>
                  <td><button class="dpad-btn" data-dx="1" data-dy="0" title="Move Right">&#8594;</button></td>
                </tr>
                <tr>
                  <td></td>
                  <td><button class="dpad-btn" data-dx="0" data-dy="1" title="Move Down">&#8595;</button></td>
                  <td></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    </div>
  </body>
</html>
