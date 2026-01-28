import { palette } from '@/lib/theme';

export type MapboxCenter = readonly [number, number]; // [lng, lat]

export type MapboxPointFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties?: Record<string, unknown>;
};

export type MapboxFeatureCollection = {
  type: 'FeatureCollection';
  features: MapboxPointFeature[];
};

export function buildMapboxHtml(params: {
  accessToken: string;
  styleUrl?: string;
  center?: MapboxCenter;
  zoom?: number;
  points?: MapboxFeatureCollection;
  pointColor?: string;
  /** When true, render a slow pulsing ring behind point circles (used for single-location maps). */
  pulsePoints?: boolean;
  /** User's current location rendered as a green dot. */
  userLocation?: MapboxCenter;
  /**
   * Preferred label language for basemap labels.
   * For Mapbox Standard: uses `map.setConfigProperty('basemap','language', ...)` when available.
   * For other styles: attempts to rewrite symbol layer `text-field` to prefer `name_<lang>` fields.
   *
   * Examples: 'he', 'en', 'ar', 'fr'.
   */
  language?: string;
}): string {
  const hasExplicitCenter = Array.isArray(params.center) && params.center.length === 2;
  const center = params.center ?? [34.7818, 32.0853];
  const zoom = typeof params.zoom === 'number' ? params.zoom : 11;
  const token = params.accessToken;
  // Default to Streets v12 so label symbol layers exist and we can reliably localize them
  // (Mapbox Standard is imports-based; in many cases its label layers are not directly rewriteable).
  const styleUrl = params.styleUrl || 'mapbox://styles/mapbox/streets-v12';
  const points = params.points ?? { type: 'FeatureCollection', features: [] };
  const pointColor = (params.pointColor || '').trim() || '#8B5CF6'; // default: purple
  const pulsePoints = !!params.pulsePoints;
  const userLocation = params.userLocation;
  const userDotColor = palette.successGreen;
  const language = (params.language || 'he').trim().toLowerCase() || 'he';
  const isRtl = ['ar', 'he', 'fa', 'ur'].includes(language);

  // NOTE: This HTML is used inside WebView (native) and iframe srcDoc (web).
  return `<!doctype html>
<html lang=${JSON.stringify(language)} dir=${JSON.stringify(isRtl ? 'rtl' : 'ltr')}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body { height: 100%; width: 100%; margin: 0; padding: 0; background: #fff; }
      #map { position: absolute; top: 0; bottom: 0; width: 100%; }
      .error {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        padding: 16px;
        color: #991B1B;
        background: #FEE2E2;
        text-align: center;
      }

      /* Larger, RTL-friendly popup card */
      .mapboxgl-popup { direction: rtl; }
      .mapboxgl-popup-content {
        padding: 0 !important;
        border-radius: 16px !important;
        overflow: hidden;
        box-shadow: 0 18px 40px rgba(17,24,39,0.22);
        width: 290px;
        max-width: calc(100vw - 32px);
        background: #FFFFFF;
      }
      .mapboxgl-popup-close-button {
        font-size: 22px;
        line-height: 22px;
        padding: 8px 10px;
        color: #111827;
        opacity: 0.7;
      }
      .aptCard { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
      .aptBody { padding: 12px 12px 14px; }
      .carousel {
        width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type: x mandatory;
        display: flex;
        gap: 10px;
        padding: 0 0 10px;
        margin: 0 0 8px;
      }
      .carousel::-webkit-scrollbar { display: none; }
      .slide {
        flex: 0 0 100%;
        scroll-snap-align: start;
      }
      .slideInner {
        width: 100%;
        height: 156px;
        border-radius: 14px;
        overflow: hidden;
        background: #F3F4F6;
        border: 1px solid #E5E7EB;
      }
      .slideImg {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .aptTitle { font-weight: 950; font-size: 18px; color: #111827; margin: 2px 0 6px; letter-spacing: -0.2px; }
      .aptMeta { font-size: 13px; color: #374151; margin: 0 0 10px; line-height: 18px; }
      .aptMetaMuted { color: #6B7280; }
      .aptPillsRow {
        display: flex;
        width: 100%;
        /* Always hug the RIGHT edge, regardless of page RTL */
        direction: ltr;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0 0 10px;
        justify-content: flex-end;
      }
      .aptPill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(94,63,45,0.10);
        border: 1px solid rgba(94,63,45,0.14);
        color: #5e3f2d;
        font-weight: 900;
        font-size: 12px;
        line-height: 14px;
        white-space: nowrap;
        direction: rtl;
      }
      .aptDivider { height: 1px; background: rgba(229,231,235,0.9); margin: 10px 0 10px; }
      .aptActionsRow {
        display: flex;
        flex-direction: row;
        gap: 10px;
        align-items: stretch;
        margin-top: 10px;
        /* Force LTR layout so the heart is always on the LEFT of the primary button */
        direction: ltr;
      }
      .aptPrimaryBtn {
        flex: 1;
        height: 46px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #5e3f2d;
        color: #FFFFFF;
        font-weight: 900;
        font-size: 14px;
        line-height: 18px;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 12px 24px rgba(17,24,39,0.20);
      }
      .aptLikeBtn {
        width: 46px;
        height: 46px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        background: rgba(255,255,255,0.92);
        border: 1px solid rgba(229,231,235,0.95);
        box-shadow: 0 12px 24px rgba(17,24,39,0.14);
        cursor: pointer;
        user-select: none;
        pointer-events: auto;
        touch-action: manipulation;
      }
      .aptLikeBtn svg { display: block; }
      /* Lucide-heart styling (match app heart) */
      .aptLikeBtn svg path { stroke: #FF2D55; fill: transparent; }
      .aptLikeBtn.isLiked svg path { fill: #FF2D55; stroke: #FF2D55; }
      .aptLikeBtn.isLiked {
        background: #FFE6EC;
        border-color: rgba(255,45,85,0.22);
      }
      /* Like animation (approx. FavoriteHeartButton) */
      .aptLikeBtn .heartFx {
        position: absolute;
        inset: 0;
        border-radius: 14px;
        pointer-events: none;
      }
      .aptLikeBtn .heartBurst {
        background: rgba(255,45,85,0.0);
        transform: scale(0.2);
        opacity: 0;
      }
      .aptLikeBtn .heartRing {
        border: 2px solid rgba(255,45,85,0.45);
        transform: scale(0.2);
        opacity: 0;
      }
      .aptLikeBtn .heartIconWrap {
        position: relative;
        width: 20px;
        height: 20px;
      }
      .aptLikeBtn .heartOutline,
      .aptLikeBtn .heartSolid {
        position: absolute;
        inset: 0;
      }
      .aptLikeBtn .heartSolid { opacity: 0; transform: scale(0.6); }

      @keyframes heartPop {
        0% { transform: scale(0.86); }
        55% { transform: scale(1.14); }
        100% { transform: scale(1); }
      }
      @keyframes burstFill {
        0% { transform: scale(0.2); opacity: 0; background: rgba(255,45,85,0.0); }
        25% { opacity: 0.9; background: rgba(255,45,85,0.18); }
        100% { transform: scale(2.6); opacity: 0; background: rgba(255,45,85,0.0); }
      }
      @keyframes ringPop {
        0% { transform: scale(0.2); opacity: 0; }
        35% { opacity: 0.8; }
        100% { transform: scale(2.1); opacity: 0; }
      }
      .aptLikeBtn.heartAnim {
        animation: heartPop 380ms cubic-bezier(.2,.9,.2,1);
      }
      .aptLikeBtn.heartAnim .heartBurst {
        animation: burstFill 520ms ease-out;
      }
      .aptLikeBtn.heartAnim .heartRing {
        animation: ringPop 520ms ease-out;
      }
      /* Outline vs filled heart states */
      .aptLikeBtn.isLiked .heartOutline { opacity: 0; transform: scale(0.6); }
      .aptLikeBtn.isLiked .heartSolid { opacity: 1; transform: scale(1); }

      /* Key-like bottom sheet (matches KeyFabPanel feel) */
      .aptSheetBackdrop {
        position: absolute; inset: 0;
        background: rgba(17,24,39,0.28);
        opacity: 0;
        pointer-events: none;
        transition: opacity 450ms ease;
      }
      .aptSheet {
        position: absolute;
        left: 50%;
        transform: translateX(-50%) translateY(18px);
        /* Lift above the bottom apartment cards + keep it narrower */
        bottom: 220px;
        width: calc(100% - 36px);
        max-width: 420px;
        max-height: 54vh;
        background: #FFFFFF;
        border-radius: 20px;
        overflow: hidden;
        border: 1px solid rgba(94,63,45,0.14);
        box-shadow: 0 18px 40px rgba(17,24,39,0.22);
        opacity: 0;
        pointer-events: none;
        transition: transform 450ms ease, opacity 450ms ease;
        /* Ensure consistent typography with the rest of the card */
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }
      .aptSheetOpen .aptSheetBackdrop { opacity: 1; pointer-events: auto; }
      .aptSheetOpen .aptSheet { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0); }
      .aptSheetHeader {
        display: flex;
        flex-direction: row-reverse;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 12px 0;
      }
      .aptSheetTitle {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-weight: 950;
        font-size: 20px;
        color: #5e3f2d;
        margin: 0;
        letter-spacing: -0.2px;
        text-align: right;
        direction: rtl;
        writing-direction: rtl;
      }
      .aptSheetClose {
        width: 34px;
        height: 34px;
        border-radius: 17px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(94,63,45,0.10);
        border: 1px solid rgba(94,63,45,0.14);
        cursor: pointer;
        user-select: none;
      }
      .aptSheetBody { padding: 12px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.js"></script>
    <script>
      (function () {
        try {
          var token = ${JSON.stringify(token)};
          if (!token) {
            document.getElementById('map').outerHTML =
              '<div class="error">חסר MAPBOX token (EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN)</div>';
            return;
          }
          mapboxgl.accessToken = token;

          try {
            if (mapboxgl && typeof mapboxgl.setRTLTextPlugin === 'function') {
              mapboxgl.setRTLTextPlugin(
                'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
                function () {},
                false
              );
            }
          } catch (_) {}

          var center = ${JSON.stringify(center)};
          var zoom = ${JSON.stringify(zoom)};
          var styleUrl = ${JSON.stringify(styleUrl)};
          var points = ${JSON.stringify(points)};
          var hasExplicitCenter = ${JSON.stringify(hasExplicitCenter)};
          var pulsePoints = ${JSON.stringify(pulsePoints)};
          var userLocation = ${JSON.stringify(userLocation ?? null)};
          var preferredLanguage = ${JSON.stringify(language)};

          var mapOptions = {
            container: 'map',
            style: styleUrl,
            center: center,
            zoom: zoom,
          };

          // For Mapbox Standard: language can be provided via config at construction time.
          // This tends to be more reliable than setting it after load in some environments.
          try {
            // Different Mapbox Standard revisions/tools sometimes use different keys for language.
            // We'll set both and later verify what actually sticks.
            mapOptions.config = { basemap: { language: preferredLanguage || 'he', locale: preferredLanguage || 'he' } };
          } catch (_) {}

          var map = new mapboxgl.Map(mapOptions);
          var __lastLabelRewriteCount = 0;
          var __lastLabelRewriteTried = 0;
          var __labelRewriteErrors = [];
          var __lastNameLabelCandidates = 0;
          var __lastSymbolWithTextField = 0;

          function __getUserLang() {
            try {
              var raw = (typeof navigator !== 'undefined' && navigator && navigator.language) ? String(navigator.language) : '';
              var short = raw.toLowerCase().split('-')[0];
              return short || 'he';
            } catch (_) {
              return 'he';
            }
          }

          function __applyLabelLanguage(targetLang) {
            var userLang = __getUserLang();
            var fallbackLang = (userLang && userLang !== targetLang) ? userLang : null;

            // Build a "coalesce" expression with strong Hebrew preference + safe fallbacks.
            var coalesce = ['coalesce',
              ['get', 'name_' + targetLang],
              ['get', 'name:' + targetLang],
              // Many Mapbox tilesets store local script in nonlatin fields.
              ['get', 'name_nonlatin'],
              ['get', 'name:nonlatin']
            ];
            // IMPORTANT: prefer 'name' (often local/native script) BEFORE falling back to the device language.
            // Otherwise, if the device is in English, we would incorrectly pick "name_en" even when "name" is Hebrew.
            coalesce.push(['get', 'name']);
            coalesce.push(['get', 'name_local']);
            coalesce.push(['get', 'name_int']);
            if (fallbackLang) {
              coalesce.push(['get', 'name_' + fallbackLang]);
              coalesce.push(['get', 'name:' + fallbackLang]);
            }
            coalesce.push(['get', 'name_en']);
            coalesce.push(['get', 'name:en']);
            coalesce.push(['get', 'name:latin']);

            // text-field is typed as "formatted" in style-spec; in Mapbox Standard many layers
            // use formatted expressions. Wrap our string expression with format so it always
            // satisfies the expected type (otherwise setLayoutProperty can throw).
            var formattedText = ['format', coalesce, {}];

            var __usedBasemapConfig = false;
            try {
              // For Mapbox Standard style (v3+), this is the preferred API if present.
              // IMPORTANT: if we can set basemap language via config, do NOT rewrite layer text-fields,
              // otherwise we can accidentally override Standard's internal localization and fall back
              // to Hebrew/English from raw tile properties.
              if (map.setConfigProperty) {
                var keysToTry = ['language', 'locale'];

                // Mapbox Standard is an "imports" style. The import id isn't always 'basemap'
                // (it can vary by style revision), so discover and try all import ids.
                var importIds = ['basemap'];
                try {
                  var styleObjForImports = map.getStyle && map.getStyle();
                  var imports = styleObjForImports && styleObjForImports.imports;
                  if (imports && imports.length) {
                    for (var ii = 0; ii < imports.length; ii++) {
                      var imp = imports[ii];
                      if (imp && imp.id) importIds.push(String(imp.id));
                    }
                  }
                } catch (_) {}

                // De-dupe ids
                var seenImport = {};
                var uniqueImportIds = [];
                for (var ui = 0; ui < importIds.length; ui++) {
                  var id = importIds[ui];
                  if (!id || seenImport[id]) continue;
                  seenImport[id] = true;
                  uniqueImportIds.push(id);
                }

                for (var idi = 0; idi < uniqueImportIds.length && !__usedBasemapConfig; idi++) {
                  var importId = uniqueImportIds[idi];
                  for (var ki = 0; ki < keysToTry.length; ki++) {
                    try {
                      var k = keysToTry[ki];
                      map.setConfigProperty(importId, k, targetLang);
                      // Verify it actually stuck; if not, keep trying other ids/keys.
                      if (map.getConfigProperty && map.getConfigProperty(importId, k) === targetLang) {
                        __usedBasemapConfig = true;
                        break;
                      }
                    } catch (_) {}
                  }
                }
              }
            } catch (_) {}

            if (__usedBasemapConfig) return;

            try {
              var style = map.getStyle && map.getStyle();
              var layers = style && style.layers;
              if (!layers || !layers.length) return;

              function __textFieldLooksLikeNameLabel(tf) {
                try {
                  if (tf == null) return false;

                  // Robust scan for "name*" tokens without JSON.stringify (which can fail for some objects).
                  // Returns true if any string token looks like: name, name_en, name:he, name-he, {name}, etc.
                  var seen = 0;
                  function looksLikeNameToken(s) {
                    try {
                      if (!s) return false;
                      var t = String(s);
                      // Fast-path: common patterns
                      if (t === 'name') return true;
                      if (t.indexOf('{name') !== -1) return true;
                      return /^name([:_-]|$)/.test(t);
                    } catch (_) {
                      return false;
                    }
                  }

                  function walk(x, depth) {
                    if (seen++ > 600) return false; // safety guard
                    if (depth > 10) return false;
                    if (x == null) return false;
                    var ty = typeof x;
                    if (ty === 'string') return looksLikeNameToken(x);
                    if (ty === 'number' || ty === 'boolean') return false;
                    if (Array.isArray(x)) {
                      for (var i = 0; i < x.length; i++) {
                        if (walk(x[i], depth + 1)) return true;
                      }
                      return false;
                    }
                    if (ty === 'object') {
                      // Iterate object values
                      for (var k in x) {
                        if (!Object.prototype.hasOwnProperty.call(x, k)) continue;
                        if (walk(x[k], depth + 1)) return true;
                      }
                      return false;
                    }
                    return false;
                  }

                  return walk(tf, 0);
                } catch (_) {
                  return false;
                }
              }

              var changed = 0;
              var tried = 0;
              var symbolWithText = 0;
              var nameCandidates = 0;
              for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                // Only target label layers: symbol layers that actually define a text-field.
                if (!layer || layer.type !== 'symbol') continue;
                var layout = layer.layout || {};
                if (layout['text-field'] == null) continue;
                symbolWithText++;
                // Avoid clobbering non-name symbol layers (e.g. highway shields, route refs, house numbers).
                if (!__textFieldLooksLikeNameLabel(layout['text-field'])) continue;
                nameCandidates++;
                try {
                  tried++;
                  // Prefer the simplest expression (coalesce) first — this matches the working snippet you sent.
                  // If Mapbox rejects it for type reasons, fall back to an explicit "formatted" expression.
                  try {
                    map.setLayoutProperty(layer.id, 'text-field', coalesce);
                    changed++;
                    continue;
                  } catch (e1) {
                    map.setLayoutProperty(layer.id, 'text-field', formattedText);
                    changed++;
                    continue;
                  }
                } catch (e2) {
                  try {
                    if (__labelRewriteErrors.length < 3) {
                      __labelRewriteErrors.push({
                        layer: layer && layer.id ? String(layer.id) : null,
                        message: (e2 && e2.message) ? String(e2.message) : String(e2),
                      });
                    }
                  } catch (_) {}
                }
              }

              __lastLabelRewriteCount = changed;
              __lastLabelRewriteTried = tried;
              __lastSymbolWithTextField = symbolWithText;
              __lastNameLabelCandidates = nameCandidates;

              // Don't "lock" after first run — some styles (and iOS WebView) may surface
              // more layers progressively; we'll keep trying on idle/style events (throttled).
            } catch (_) {}
          }

          var __langApplyScheduled = false;
          var __langLastAppliedAt = 0;

          function __applyPreferredLabelsNow() {
            __langApplyScheduled = false;
            __langLastAppliedAt = Date.now();
            __applyLabelLanguage(preferredLanguage || 'he');
          }

          function __schedulePreferredLabels() {
            if (__langApplyScheduled) return;
            // throttle: max once per ~250ms
            try {
              if (__langLastAppliedAt && (Date.now() - __langLastAppliedAt) < 250) return;
            } catch (_) {}
            __langApplyScheduled = true;
            try {
              requestAnimationFrame(__applyPreferredLabelsNow);
            } catch (_) {
              setTimeout(__applyPreferredLabelsNow, 0);
            }
          }

          // Re-apply language because Mapbox Standard may add/update layers after initial load.
          map.on('style.load', function () { __schedulePreferredLabels(); });
          map.on('styledata', function () { __schedulePreferredLabels(); });
          map.on('idle', function () { __schedulePreferredLabels(); });

          map.on('load', function () {
            try {
              // Language: wait for initial load, then rewrite label layers.
              __schedulePreferredLabels();

              // Debug (one-shot): report label properties/config so we can diagnose localization.
              try {
                var __debugSent = false;
                function __sendDebugOnce() {
                  if (__debugSent) return;
                  __debugSent = true;
                  try {
                    // Query all rendered features in the viewport (one-shot, debug only).
                    // This is more reliable than sampling a single point.
                    var feats = [];
                    try {
                      feats = map.queryRenderedFeatures();
                    } catch (_) {
                      // Fallback: sample the center point.
                      var pt = map.project(map.getCenter());
                      feats = map.queryRenderedFeatures([pt.x, pt.y]) || [];
                    }

                    var sample = null;
                    for (var i = 0; i < feats.length; i++) {
                      var f = feats[i];
                      if (!f || !f.layer || f.layer.type !== 'symbol') continue;
                      var p = f && f.properties;
                      if (!p) continue;
                      var keys = Object.keys(p);
                      var hasNameKey = false;
                      for (var k = 0; k < keys.length; k++) {
                        if (keys[k] && String(keys[k]).indexOf('name') === 0) { hasNameKey = true; break; }
                      }
                      if (!hasNameKey) continue;
                      sample = {
                        layer: f && f.layer && f.layer.id,
                        keys: keys.filter(function(x){ return x && String(x).indexOf('name') === 0; }).slice(0, 30),
                        values: {
                          name: p.name,
                          name_target: p['name_' + preferredLanguage],
                          name_colon_target: p['name:' + preferredLanguage],
                          name_nonlatin: p['name_nonlatin'] || p['name:nonlatin'],
                          name_en: p['name_en'] || p['name:en'],
                        },
                        layerType: f && f.layer && f.layer.type,
                        source: f && f.source,
                        sourceLayer: f && f.sourceLayer,
                      };
                      break;
                    }
                    var meta = {
                      preferredLanguage: preferredLanguage,
                      userLang: __getUserLang(),
                      styleUrl: styleUrl,
                      mapboxGlVersion: (mapboxgl && mapboxgl.version) ? mapboxgl.version : null,
                      hasSetConfigProperty: !!map.setConfigProperty,
                      hasGetConfigProperty: !!map.getConfigProperty,
                      configLanguage: (map.getConfigProperty ? (function(){ try { return map.getConfigProperty('basemap','language'); } catch (_) { return null; } })() : null),
                      configLocale: (map.getConfigProperty ? (function(){ try { return map.getConfigProperty('basemap','locale'); } catch (_) { return null; } })() : null),
                      renderedFeaturesCount: feats && feats.length ? feats.length : 0,
                      rewroteTextFieldLayers: __lastLabelRewriteCount,
                      triedTextFieldLayers: __lastLabelRewriteTried,
                      symbolLayersWithTextField: __lastSymbolWithTextField,
                      nameLabelCandidates: __lastNameLabelCandidates,
                      rewriteErrors: __labelRewriteErrors,
                    };
                    try {
                      var styleObj = map.getStyle && map.getStyle();
                      var imports = styleObj && styleObj.imports;
                      meta.styleHasImports = !!(imports && imports.length);
                      meta.importIds = (imports && imports.map(function(i){ return i && i.id; }).filter(Boolean).slice(0, 20)) || [];
                      meta.layerCount = (styleObj && styleObj.layers && styleObj.layers.length) ? styleObj.layers.length : 0;
                      if (styleObj && styleObj.layers && styleObj.layers.length) {
                        var sym = 0;
                        for (var li = 0; li < styleObj.layers.length; li++) {
                          if (styleObj.layers[li] && styleObj.layers[li].type === 'symbol') sym++;
                        }
                        meta.symbolLayerCount = sym;
                      } else {
                        meta.symbolLayerCount = 0;
                      }
                    } catch (_) {}
                    var payload = JSON.stringify({ type: 'MAP_DEBUG_LABEL_KEYS', meta: meta, sample: sample });
                    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
                    if (window.parent && window.parent.postMessage) window.parent.postMessage(payload, '*');
                  } catch (_) {}
                }
                map.once('idle', __sendDebugOnce);
              } catch (_) {}

              if (userLocation && Array.isArray(userLocation) && userLocation.length === 2) {
                map.addSource('user-location', {
                  type: 'geojson',
                  data: {
                    type: 'FeatureCollection',
                    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: userLocation }, properties: {} }]
                  }
                });
                // Soft shadow behind the user marker (gives the white ring more depth)
                map.addLayer({
                  id: 'user-location-shadow',
                  type: 'circle',
                  source: 'user-location',
                  paint: {
                    'circle-radius': 13,
                    'circle-color': 'rgba(0,0,0,0.75)',
                    'circle-opacity': 0.42,
                    'circle-blur': 1.3,
                    'circle-stroke-width': 0,
                  }
                });
                // Subtle pulse ring behind the user dot
                map.addLayer({
                  id: 'user-location-pulse',
                  type: 'circle',
                  source: 'user-location',
                  paint: {
                    'circle-radius': 14,
                    'circle-color': ${JSON.stringify(userDotColor)},
                    'circle-opacity': 0.18,
                    'circle-stroke-width': 0,
                  }
                });
                map.addLayer({
                  id: 'user-location-dot',
                  type: 'circle',
                  source: 'user-location',
                  paint: {
                    'circle-radius': 7,
                    'circle-color': ${JSON.stringify(userDotColor)},
                    'circle-opacity': 1,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#FFFFFF'
                  }
                });

                // Animate the pulse gently
                var __userPulseStart = Date.now();
                var __userPulseDuration = 2400;
                function __tickUserPulse() {
                  try {
                    if (!map || !map.getLayer('user-location-pulse')) return;
                    var t = ((Date.now() - __userPulseStart) % __userPulseDuration) / __userPulseDuration;
                    // easeOutQuad
                    var ease = 1 - Math.pow(1 - t, 2);
                    // Subtle expansion + fade
                    map.setPaintProperty('user-location-pulse', 'circle-radius', 12 + ease * 16);
                    map.setPaintProperty('user-location-pulse', 'circle-opacity', (1 - ease) * 0.18);
                    requestAnimationFrame(__tickUserPulse);
                  } catch (_) {}
                }
                requestAnimationFrame(__tickUserPulse);
              }

              // Key-like animated apartment sheet (instead of default Mapbox Popup)
              var __sheetMounted = false;
              var __sheetBackdrop = null;
              var __sheetEl = null;
              var __sheetBody = null;
              function __ensureAptSheet() {
                if (__sheetMounted) return;
                __sheetMounted = true;

                __sheetBackdrop = document.createElement('div');
                __sheetBackdrop.className = 'aptSheetBackdrop';
                __sheetBackdrop.onclick = function () { __closeAptSheet(); };
                document.body.appendChild(__sheetBackdrop);

                __sheetEl = document.createElement('div');
                __sheetEl.className = 'aptSheet';

                var header = document.createElement('div');
                header.className = 'aptSheetHeader';
                var title = document.createElement('div');
                title.className = 'aptSheetTitle';
                title.textContent = 'פרטי דירה';
                var closeBtn = document.createElement('div');
                closeBtn.className = 'aptSheetClose';
                closeBtn.innerHTML = '&times;';
                closeBtn.onclick = function () { __closeAptSheet(); };
                // Swap positions: put X on the right and title on the left
                header.appendChild(closeBtn);
                header.appendChild(title);

                __sheetBody = document.createElement('div');
                __sheetBody.className = 'aptSheetBody';

                __sheetEl.appendChild(header);
                __sheetEl.appendChild(__sheetBody);
                document.body.appendChild(__sheetEl);
              }

              function __openAptSheet(contentEl) {
                __ensureAptSheet();
                try {
                  __sheetBody.innerHTML = '';
                  __sheetBody.appendChild(contentEl);
                  document.body.classList.add('aptSheetOpen');
                } catch (_) {}
              }

              function __closeAptSheet() {
                try { document.body.classList.remove('aptSheetOpen'); } catch (_) {}
              }

              var hasApts = !!(points && points.features && points.features.length);
              if (hasApts) {
                // Build a quick lookup so we can center/highlight by apartment id
                var __aptCoordById = {};
                var __aptImgById = {};
                try {
                  (points.features || []).forEach(function (f) {
                    var p = f && f.properties;
                    var id = p && (p.id != null ? String(p.id) : null);
                    var c = f && f.geometry && f.geometry.coordinates;
                    if (!id || !c || c.length < 2) return;
                    __aptCoordById[id] = c;
                    // Best-effort marker image URL (first image in JSON, or single image_url)
                    try {
                      var imgUrls = [];
                      try { imgUrls = JSON.parse((p && p.image_urls_json) ? String(p.image_urls_json) : '[]'); } catch (_) { imgUrls = []; }
                      if (!imgUrls || !imgUrls.length) {
                        var single = p && p.image_url ? String(p.image_url) : '';
                        if (single) imgUrls = [single];
                      }
                      var first = (imgUrls && imgUrls.length) ? String(imgUrls[0] || '') : '';
                      if (first) __aptImgById[id] = first;
                    } catch (_) {}
                  });
                } catch (_) {}

                map.addSource('apartments', { type: 'geojson', data: points, promoteId: 'id' });
                // Soft shadow behind every apartment marker (and slightly stronger when selected)
                map.addLayer({
                  id: 'apt-shadow',
                  type: 'circle',
                  source: 'apartments',
                  paint: {
                    'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 18, 14],
                    'circle-color': 'rgba(0,0,0,0.75)',
                    'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.52, 0.38],
                    'circle-blur': 1.35,
                    'circle-stroke-width': 0,
                  }
                });
                map.addLayer({
                  id: 'apt-circles',
                  type: 'circle',
                  source: 'apartments',
                  paint: {
                    'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 11, 8],
                    // Always keep a visible dot; the photo marker is an optional overlay on top.
                    'circle-color': ${JSON.stringify(pointColor)},
                    'circle-opacity': 0.9,
                    'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2],
                    'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.98)', '#FFFFFF']
                  }
                });

                // Selected apartment photo marker (white ring + drop shadow) shown above the circles
                map.addSource('selected-apartment', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                map.addLayer({
                  id: 'selected-apt-photo',
                  type: 'symbol',
                  source: 'selected-apartment',
                  layout: {
                    'icon-image': ['get', 'icon'],
                    'icon-size': 1,
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true
                  }
                });

                if (pulsePoints) {
                  map.addLayer({
                    id: 'apt-pulse',
                    type: 'circle',
                    source: 'apartments',
                    paint: {
                      'circle-radius': 12,
                      'circle-color': ${JSON.stringify(pointColor)},
                      'circle-opacity': 0.28,
                      'circle-stroke-width': 0,
                    },
                  }, 'apt-circles');

                  var __pulseStart = Date.now();
                  var __pulseDuration = 2600;
                  function __tickPulse() {
                    if (!map || !map.getLayer('apt-pulse')) return;
                    var t = ((Date.now() - __pulseStart) % __pulseDuration) / __pulseDuration;
                    var ease = 1 - Math.pow(1 - t, 2);
                    map.setPaintProperty('apt-pulse', 'circle-radius', 10 + ease * 16);
                    map.setPaintProperty('apt-pulse', 'circle-opacity', (1 - ease) * 0.28);
                    requestAnimationFrame(__tickPulse);
                  }
                  requestAnimationFrame(__tickPulse);
                }

                if (!hasExplicitCenter) {
                  var bounds = new mapboxgl.LngLatBounds();
                  points.features.forEach(function (f) {
                    var c = f && f.geometry && f.geometry.coordinates;
                    if (c && c.length >= 2) bounds.extend(c);
                  });
                  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 14 });
                }
              }

              // Highlight an apartment when the app scrolls the bottom cards.
              var __selectedAptId = null;
              var __pendingHighlightId = null;

              function __drawCircularIcon(url, sizePx, done) {
                try {
                  var img = new Image();
                  try { img.crossOrigin = 'anonymous'; } catch (_) {}
                  img.onload = function () {
                    try {
                      var c = document.createElement('canvas');
                      c.width = sizePx;
                      c.height = sizePx;
                      var ctx = c.getContext('2d');
                      if (!ctx) return done(null);
                      var r = sizePx / 2;
                      var border = 3;

                      // Shadowed white base circle (card-like shadow)
                      ctx.save();
                      ctx.beginPath();
                      ctx.arc(r, r, r - 1, 0, Math.PI * 2);
                      ctx.closePath();
                      ctx.fillStyle = 'rgba(255,255,255,1)';
                      ctx.shadowColor = 'rgba(0,0,0,0.28)';
                      ctx.shadowBlur = 12;
                      ctx.shadowOffsetX = 0;
                      ctx.shadowOffsetY = 8;
                      ctx.fill();
                      ctx.restore();

                      // Clip circle for photo
                      ctx.save();
                      ctx.beginPath();
                      ctx.arc(r, r, r - border - 2, 0, Math.PI * 2);
                      ctx.closePath();
                      ctx.clip();

                      // Cover-style draw
                      var iw = img.naturalWidth || img.width;
                      var ih = img.naturalHeight || img.height;
                      var scale = Math.max((sizePx / iw), (sizePx / ih));
                      var dw = iw * scale;
                      var dh = ih * scale;
                      var dx = (sizePx - dw) / 2;
                      var dy = (sizePx - dh) / 2;
                      ctx.drawImage(img, dx, dy, dw, dh);
                      ctx.restore();

                      // White ring
                      ctx.save();
                      ctx.beginPath();
                      ctx.arc(r, r, r - border, 0, Math.PI * 2);
                      ctx.closePath();
                      ctx.lineWidth = border;
                      ctx.strokeStyle = 'rgba(255,255,255,0.98)';
                      ctx.stroke();
                      ctx.restore();

                      done(c);
                    } catch (_) {
                      done(null);
                    }
                  };
                  img.onerror = function () { done(null); };
                  img.src = url;
                } catch (_) {
                  done(null);
                }
              }

              function __setSelectedPhotoMarker(apartmentId) {
                try {
                  var src = map.getSource && map.getSource('selected-apartment');
                  if (!src || !src.setData) return;

                  if (!apartmentId) {
                    src.setData({ type: 'FeatureCollection', features: [] });
                    return;
                  }

                  var id = String(apartmentId);
                  var coord = (typeof __aptCoordById !== 'undefined') ? __aptCoordById[id] : null;
                  if (!coord || coord.length < 2) {
                    src.setData({ type: 'FeatureCollection', features: [] });
                    return;
                  }

                  var url = (typeof __aptImgById !== 'undefined') ? __aptImgById[id] : null;
                  var iconName = 'apt-photo-' + id;

                  function setDataWithIcon(nameOrNull) {
                    try {
                      src.setData({
                        type: 'FeatureCollection',
                        features: [{
                          type: 'Feature',
                          geometry: { type: 'Point', coordinates: coord },
                          properties: { icon: nameOrNull || '' }
                        }]
                      });
                    } catch (_) {}
                  }

                  if (!url) {
                    setDataWithIcon('');
                    return;
                  }

                  if (map.hasImage && map.hasImage(iconName)) {
                    setDataWithIcon(iconName);
                    return;
                  }

                  __drawCircularIcon(url, 64, function (canvas) {
                    if (!canvas) {
                      setDataWithIcon('');
                      return;
                    }
                    try {
                      map.addImage(iconName, canvas, { pixelRatio: 2 });
                      setDataWithIcon(iconName);
                    } catch (_) {
                      setDataWithIcon('');
                    }
                  });
                } catch (_) {}
              }
              function __setHighlightedApartment(id, shouldCenter) {
                try {
                  if (!map || !map.getSource('apartments')) {
                    __pendingHighlightId = id;
                    return;
                  }
                  // clear previous
                  if (__selectedAptId != null) {
                    try { map.setFeatureState({ source: 'apartments', id: __selectedAptId }, { selected: false }); } catch (_) {}
                  }
                  __selectedAptId = (id != null && id !== '') ? String(id) : null;
                  if (__selectedAptId != null) {
                    try { map.setFeatureState({ source: 'apartments', id: __selectedAptId }, { selected: true }); } catch (_) {}
                    try { __setSelectedPhotoMarker(__selectedAptId); } catch (_) {}
                    if (shouldCenter) {
                      try {
                        var c = (typeof __aptCoordById !== 'undefined') ? __aptCoordById[String(__selectedAptId)] : null;
                        if (c && c.length >= 2) {
                          // offset upwards so the bottom cards don't cover the marker
                          map.easeTo({ center: c, duration: 450, offset: [0, 140] });
                        }
                      } catch (_) {}
                    }
                  }
                } catch (_) {}
              }

              // Apply any queued highlight after data loads
              try {
                if (__pendingHighlightId != null) __setHighlightedApartment(__pendingHighlightId, false);
              } catch (_) {}

              function __handleInboundMessage(ev) {
                try {
                  var raw = ev && ev.data;
                  if (!raw) return;
                  var msg = null;
                  if (typeof raw === 'string') {
                    try { msg = JSON.parse(raw); } catch (_) { return; }
                  } else {
                    msg = raw;
                  }
                  if (!msg || !msg.type) return;
                  if (msg.type === 'HIGHLIGHT_APARTMENT') {
                    __setHighlightedApartment(msg.id, true);
                  }
                  if (msg.type === 'LIKE_STATUS') {
                    try {
                      var id = msg.id != null ? String(msg.id) : '';
                      var liked = !!msg.isLiked;
                      if (!id) return;
                      if (__sheetBody && __sheetBody.querySelector) {
                        var btn = __sheetBody.querySelector('[data-like-id="' + id + '"]');
                        if (btn) {
                          if (liked) btn.classList.add('isLiked');
                          else btn.classList.remove('isLiked');
                        }
                      }
                    } catch (_) {}
                  }
                } catch (_) {}
              }
              // Support RN WebView + browser iframe
              try { window.addEventListener('message', __handleInboundMessage); } catch (_) {}
              try { document.addEventListener('message', __handleInboundMessage); } catch (_) {}

              map.on('click', 'apt-circles', function (e) {
                var f = e.features[0];
                var props = f.properties || {};
                var imageUrls = [];
                try { imageUrls = JSON.parse(props.image_urls_json || '[]'); } catch (_) {}
                if (imageUrls.length === 0 && props.image_url) imageUrls = [props.image_url];
                if (imageUrls.length === 0) imageUrls = ['https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'];
                var aptId = (props.id != null) ? String(props.id) : '';
                var city = (props.city != null) ? String(props.city) : '';
                var address = (props.address != null) ? String(props.address) : '';
                var priceRaw = (props.price != null) ? String(props.price) : '';
                var roomsRaw = (props.rooms != null) ? String(props.rooms) : '';
                var sqmRaw = (props.sqm != null) ? String(props.sqm) : (props.size_sqm != null ? String(props.size_sqm) : '');
                var availableRaw = (props.available_slots != null) ? String(props.available_slots) : '';

                function __postOpenApartment() {
                  try {
                    if (!aptId) return;
                    var payload = JSON.stringify({ type: 'OPEN_APARTMENT', id: aptId });
                    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
                    if (window.parent && window.parent.postMessage) window.parent.postMessage(payload, '*');
                  } catch (_) {}
                }
                function __postToggleLike() {
                  try {
                    if (!aptId) return;
                    var payload = JSON.stringify({ type: 'TOGGLE_LIKE_APARTMENT', id: aptId });
                    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
                    if (window.parent && window.parent.postMessage) window.parent.postMessage(payload, '*');
                  } catch (_) {}
                }
                function __requestLikeStatus() {
                  try {
                    if (!aptId) return;
                    var payload = JSON.stringify({ type: 'REQUEST_LIKE_STATUS', id: aptId });
                    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
                    if (window.parent && window.parent.postMessage) window.parent.postMessage(payload, '*');
                  } catch (_) {}
                }

                var root = document.createElement('div');
                root.className = 'aptCard';
                var body = document.createElement('div');
                body.className = 'aptBody';
                var carousel = document.createElement('div');
                carousel.className = 'carousel';
                imageUrls.slice(0, 10).forEach(function (u) {
                  var slide = document.createElement('div'); slide.className = 'slide';
                  var inner = document.createElement('div'); inner.className = 'slideInner';
                  var im = document.createElement('img'); im.className = 'slideImg'; im.src = u;
                  im.onerror = function() { im.src='https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'; };
                  inner.appendChild(im); slide.appendChild(inner); carousel.appendChild(slide);
                });
                body.appendChild(carousel);

                var h = document.createElement('div');
                h.className = 'aptTitle';
                h.textContent = props.title || 'דירה';
                body.appendChild(h);

                var meta = document.createElement('div');
                meta.className = 'aptMeta';
                meta.textContent = address || '';
                if (city) {
                  var s = document.createElement('span');
                  s.className = 'aptMetaMuted';
                  s.textContent = (address ? ' • ' : '') + city;
                  meta.appendChild(s);
                }
                body.appendChild(meta);

                // Pills row (only render what exists)
                var pills = document.createElement('div');
                pills.className = 'aptPillsRow';
                function addPill(text) {
                  var p = document.createElement('div');
                  p.className = 'aptPill';
                  p.textContent = text;
                  pills.appendChild(p);
                }

                // available slots
                var av = parseInt(availableRaw, 10);
                if (!isNaN(av)) addPill(av + ' מקומות פנויים');

                // distance from user (if we have userLocation + apartment coords)
                try {
                  function __toRad(d) { return (d * Math.PI) / 180; }
                  function __haversineKm(lat1, lng1, lat2, lng2) {
                    var R = 6371;
                    var dLat = __toRad(lat2 - lat1);
                    var dLng = __toRad(lng2 - lng1);
                    var a =
                      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(__toRad(lat1)) * Math.cos(__toRad(lat2)) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
                    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    return R * c;
                  }
                  function __formatDistanceKm(km) {
                    try {
                      if (km == null || !isFinite(km) || km < 0) return '';
                      if (km < 1) return Math.max(0, Math.round(km * 1000)) + ' מ׳';
                      var rounded = Math.round(km * 10) / 10;
                      var s = String(rounded);
                      if (s.indexOf('.0') === s.length - 2) s = String(Math.round(rounded));
                      return s + ' ק״מ';
                    } catch (_) {
                      return '';
                    }
                  }

                  var coords = f && f.geometry && f.geometry.coordinates;
                  var lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
                  var lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
                  if (userLocation && Array.isArray(userLocation) && userLocation.length === 2 && isFinite(lng) && isFinite(lat)) {
                    var ulng = Number(userLocation[0]);
                    var ulat = Number(userLocation[1]);
                    if (isFinite(ulng) && isFinite(ulat)) {
                      var km = __haversineKm(ulat, ulng, lat, lng);
                      var label = __formatDistanceKm(km);
                      if (label) addPill(label);
                    }
                  }
                } catch (_) {}

                // rooms
                var rooms = parseFloat(roomsRaw);
                if (!isNaN(rooms)) addPill(rooms + ' חדרים');

                // sqm
                var sqm = parseInt(sqmRaw, 10);
                if (!isNaN(sqm)) addPill(sqm + ' מ״ר');

                // price
                var priceNum = parseInt(priceRaw, 10);
                if (!isNaN(priceNum) && priceNum > 0) {
                  try {
                    addPill('₪' + priceNum.toLocaleString('he-IL') + ' לחודש');
                  } catch (_) {
                    addPill('₪' + priceNum + ' לחודש');
                  }
                }

                if (pills.childNodes && pills.childNodes.length) {
                  body.appendChild(pills);
                }

                var divider = document.createElement('div');
                divider.className = 'aptDivider';
                body.appendChild(divider);

                // Actions row: like + open
                var actions = document.createElement('div');
                actions.className = 'aptActionsRow';

                var likeBtn = document.createElement('div');
                likeBtn.className = 'aptLikeBtn';
                likeBtn.setAttribute('data-like-id', aptId);
                likeBtn.setAttribute('role', 'button');
                likeBtn.setAttribute('tabindex', '0');
                // Heart with animation layers (outline + filled, plus burst/ring)
                var heartPath =
                  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';
                likeBtn.innerHTML =
                  '<div class="heartFx heartBurst"></div>' +
                  '<div class="heartFx heartRing"></div>' +
                  '<div class="heartIconWrap">' +
                    '<svg class="heartOutline" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                      '<path d="' + heartPath + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</svg>' +
                    '<svg class="heartSolid" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                      '<path d="' + heartPath + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</svg>' +
                  '</div>';
                function __toggleLikeUI(ev) {
                  try { ev && ev.stopPropagation && ev.stopPropagation(); } catch (_) {}
                  // Make sure the next root "tap-to-open" doesn't run, even if propagation leaks.
                  try { __ignoreNextOpen = true; } catch (_) {}
                  // Optimistic UI
                  try { likeBtn.classList.toggle('isLiked'); } catch (_) {}
                  // Trigger animation (replayable)
                  try {
                    likeBtn.classList.remove('heartAnim');
                    // force reflow so the animation restarts
                    void likeBtn.offsetWidth;
                    likeBtn.classList.add('heartAnim');
                    setTimeout(function () { try { likeBtn.classList.remove('heartAnim'); } catch (_) {} }, 600);
                  } catch (_) {}
                  __postToggleLike();
                }
                // Desktop click
                likeBtn.onclick = __toggleLikeUI;
                // Mobile WebView: handle touchend directly (some environments won't fire click if preventDefault is used)
                likeBtn.ontouchend = __toggleLikeUI;
                likeBtn.onmousedown = function (ev) { try { ev && ev.stopPropagation && ev.stopPropagation(); } catch (_) {} try { __ignoreNextOpen = true; } catch (_) {} };
                likeBtn.ontouchstart = function (ev) { try { ev && ev.stopPropagation && ev.stopPropagation(); } catch (_) {} try { __ignoreNextOpen = true; } catch (_) {} };

                var primary = document.createElement('div');
                primary.className = 'aptPrimaryBtn';
                primary.textContent = 'צפייה בדירה';
                primary.onclick = function (ev) { try { ev && ev.stopPropagation && ev.stopPropagation(); } catch (_) {} __postOpenApartment(); };

                actions.appendChild(likeBtn);
                actions.appendChild(primary);
                body.appendChild(actions);

                root.appendChild(body);
                // Ask the app for the current like status so the heart reflects reality
                __requestLikeStatus();

                var startX, startY, startT;
                var __ignoreNextOpen = false;
                function onEnd(ev, x, y) {
                  if (Math.abs(x-startX) <= 8 && Math.abs(y-startY) <= 8 && (Date.now()-startT) <= 450) {
                    if (__ignoreNextOpen) { __ignoreNextOpen = false; return; }
                    __postOpenApartment();
                  }
                }
                root.onmousedown = function(e) { startX=e.clientX; startY=e.clientY; startT=Date.now(); };
                root.onmouseup = function(e) { onEnd(e, e.clientX, e.clientY); };
                root.ontouchstart = function(e) { startX=e.touches[0].clientX; startY=e.touches[0].clientY; startT=Date.now(); };
                root.ontouchend = function(e) { onEnd(e, e.changedTouches[0].clientX, e.changedTouches[0].clientY); };
                // Keep the marker highlight + center behavior consistent with scroll selection
                try { __setHighlightedApartment(props.id, false); } catch (_) {}
                // Open a Key-like animated sheet instead of the Mapbox popup
                __openAptSheet(root);
              });
              map.on('mouseenter', 'apt-circles', function () { map.getCanvas().style.cursor = 'pointer'; });
              map.on('mouseleave', 'apt-circles', function () { map.getCanvas().style.cursor = ''; });
            } catch (_) {}
          });
        } catch (e) {
          document.getElementById('map').outerHTML = '<div class="error">שגיאה בטעינת המפה</div>';
        }
      })();
    </script>
  </body>
</html>`;
}
