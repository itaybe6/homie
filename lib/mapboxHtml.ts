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
}): string {
  const hasExplicitCenter = Array.isArray(params.center) && params.center.length === 2;
  const center = params.center ?? [34.7818, 32.0853];
  const zoom = typeof params.zoom === 'number' ? params.zoom : 11;
  const token = params.accessToken;
  const styleUrl = params.styleUrl || 'mapbox://styles/mapbox/streets-v12';
  const points = params.points ?? { type: 'FeatureCollection', features: [] };
  const pointColor = (params.pointColor || '').trim() || '#8B5CF6'; // default: purple
  const labelColor = '#6D28D9'; // purple (Tailwind violet-700)
  const pulsePoints = !!params.pulsePoints;

  // NOTE: This HTML is used inside WebView (native) and iframe srcDoc (web).
  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
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
        height: 138px;
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
      .aptTitle { font-weight: 900; font-size: 16px; color: #111827; margin: 0 0 6px; }
      .aptMeta { font-size: 12px; color: #374151; margin: 0 0 10px; }
      .aptMetaMuted { color: #6B7280; }
      /* (removed) avatars section */
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
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

          // Enable proper RTL shaping/ordering for Hebrew (and other RTL scripts).
          // Without this, Hebrew labels can appear left-to-right or with broken glyph ordering.
          try {
            if (mapboxgl && typeof mapboxgl.setRTLTextPlugin === 'function') {
              mapboxgl.setRTLTextPlugin(
                'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
                null,
                true
              );
            }
          } catch (_) {}

          var center = ${JSON.stringify(center)};
          var zoom = ${JSON.stringify(zoom)};
          var styleUrl = ${JSON.stringify(styleUrl)};
          var points = ${JSON.stringify(points)};
          var hasExplicitCenter = ${JSON.stringify(hasExplicitCenter)};
          var pulsePoints = ${JSON.stringify(pulsePoints)};
          var map = new mapboxgl.Map({
            container: 'map',
            style: styleUrl,
            center: center,
            zoom: zoom,
          });
          // Intentionally no built-in UI controls (zoom +/- / compass / scale).
          // We keep the map clean and rely on gestures (pinch/drag) and the app UI.

          // Make base-map place/road/POI labels purple (instead of default gray).
          // Some styles keep mutating layers after load, so we also retry on idle/styledata.
          var __labelsApplied = false;
          var __applyScheduled = false;
          var __heApplied = false;

          function applyHebrewLabels() {
            try {
              var style = map.getStyle && map.getStyle();
              if (!style || !style.layers) return;
              var changed = 0;
              for (var i = 0; i < style.layers.length; i++) {
                var layer = style.layers[i];
                if (!layer || layer.type !== 'symbol') continue;
                var layout = layer.layout || {};
                // Only touch layers that actually render text.
                if (!layout || typeof layout !== 'object') continue;
                if (!('text-field' in layout)) continue;
                var tf = layout['text-field'];
                // Avoid clobbering complex formatted expressions (icons+text etc.)
                if (Array.isArray(tf) && tf.length > 0 && tf[0] === 'format') continue;

                try {
                  map.setLayoutProperty(layer.id, 'text-field', [
                    'coalesce',
                    ['get', 'name_he'],
                    ['get', 'name:he'],
                    ['get', 'name'],
                    ['get', 'name_en'],
                  ]);
                  changed++;
                } catch (_) {}
              }
              if (changed > 0) __heApplied = true;
            } catch (_) {}
          }

          function applyPurpleLabels() {
            __applyScheduled = false;
            try {
              var style = map.getStyle && map.getStyle();
              if (!style || !style.layers) return;
              var changed = 0;
              for (var i = 0; i < style.layers.length; i++) {
                var layer = style.layers[i];
                if (!layer || layer.type !== 'symbol') continue;
                // Try regardless of whether text-field exists; errors are caught.
                try { map.setPaintProperty(layer.id, 'text-color', ${JSON.stringify(labelColor)}); changed++; } catch (_) {}
                // Keep labels readable on a light basemap
                try { map.setPaintProperty(layer.id, 'text-halo-color', '#FFFFFF'); } catch (_) {}
                try { map.setPaintProperty(layer.id, 'text-halo-width', 1.2); } catch (_) {}
              }
              if (changed > 0) __labelsApplied = true;
            } catch (_) {}
          }
          function scheduleApply() {
            if ((__labelsApplied && __heApplied) || __applyScheduled) return;
            __applyScheduled = true;
            try {
              requestAnimationFrame(function () {
                applyHebrewLabels();
                applyPurpleLabels();
              });
            } catch (_) {
              setTimeout(function () {
                applyHebrewLabels();
                applyPurpleLabels();
              }, 0);
            }
          }
          map.on('style.load', function () { __labelsApplied = false; __heApplied = false; scheduleApply(); });
          map.on('styledata', function () { __labelsApplied = false; __heApplied = false; scheduleApply(); });
          map.on('idle', function () { scheduleApply(); });

          map.on('load', function () {
            try {
              scheduleApply();
              if (!points || !points.features || points.features.length === 0) return;

              map.addSource('apartments', {
                type: 'geojson',
                data: points,
              });

              map.addLayer({
                id: 'apt-circles',
                type: 'circle',
                source: 'apartments',
                paint: {
                  'circle-radius': 8,
                  'circle-color': ${JSON.stringify(pointColor)},
                  'circle-opacity': 0.9,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#FFFFFF'
                }
              });

              // Optional slow pulsing ring (behind the main point)
              if (pulsePoints) {
                try {
                  map.addLayer(
                    {
                      id: 'apt-pulse',
                      type: 'circle',
                      source: 'apartments',
                      paint: {
                        'circle-radius': 12,
                        'circle-color': ${JSON.stringify(pointColor)},
                        'circle-opacity': 0.28,
                        'circle-stroke-width': 0,
                      },
                    },
                    'apt-circles'
                  );

                  // Animate radius + opacity in a loop (slow pulse)
                  var __pulseStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                  var __pulseDuration = 2600; // ms
                  function __tickPulse() {
                    try {
                      if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) {
                        requestAnimationFrame(__tickPulse);
                        return;
                      }
                      // If layer was removed (style change), stop trying.
                      if (!map.getLayer || !map.getLayer('apt-pulse')) return;
                      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                      var t = ((now - __pulseStart) % __pulseDuration) / __pulseDuration; // 0..1
                      // Ease-out-ish curve
                      var ease = 1 - Math.pow(1 - t, 2);
                      var radius = 10 + ease * 16; // 10..26
                      var opacity = (1 - ease) * 0.28; // 0.28..0
                      map.setPaintProperty('apt-pulse', 'circle-radius', radius);
                      map.setPaintProperty('apt-pulse', 'circle-opacity', opacity);
                      requestAnimationFrame(__tickPulse);
                    } catch (_) {
                      // swallow errors so the map never crashes
                    }
                  }
                  requestAnimationFrame(__tickPulse);
                } catch (_) {}
              }

              // Fit bounds to points (only when center isn't explicitly provided)
              if (!hasExplicitCenter) {
                var bounds = new mapboxgl.LngLatBounds();
                points.features.forEach(function (f) {
                  var c = f && f.geometry && f.geometry.coordinates;
                  if (!c || c.length < 2) return;
                  bounds.extend(c);
                });
                if (typeof bounds.isEmpty === 'function' ? !bounds.isEmpty() : true) {
                  map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 14 });
                }
              }

              // Popup on click
              map.on('click', 'apt-circles', function (e) {
                var f = e && e.features && e.features[0];
                if (!f) return;
                var props = f.properties || {};
                var title = props.title || 'דירה';
                var address = props.address || '';
                var city = props.city || '';
                var imageUrl = props.image_url || '';
                var imageUrlsJson = props.image_urls_json || '[]';
                var aptId = props.id || '';
                var imageUrls = [];
                try { imageUrls = JSON.parse(String(imageUrlsJson) || '[]') || []; } catch (_) { imageUrls = []; }
                if (!Array.isArray(imageUrls)) imageUrls = [];
                // Ensure at least one image
                if (imageUrls.length === 0 && imageUrl) imageUrls = [String(imageUrl)];
                if (imageUrls.length === 0) imageUrls = ['https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'];

                // Build popup DOM safely (no innerHTML injection)
                var root = document.createElement('div');
                root.className = 'aptCard';
                root.style.cursor = 'pointer';

                var body = document.createElement('div');
                body.className = 'aptBody';

                // Image carousel (swipe)
                var carousel = document.createElement('div');
                carousel.className = 'carousel';
                carousel.style.cursor = 'default';
                imageUrls.slice(0, 10).forEach(function (u) {
                  var slide = document.createElement('div');
                  slide.className = 'slide';
                  var inner = document.createElement('div');
                  inner.className = 'slideInner';
                  var im = document.createElement('img');
                  im.className = 'slideImg';
                  im.alt = String(title || 'דירה');
                  im.loading = 'lazy';
                  im.src = String(u);
                  im.onerror = function () {
                    im.src = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
                  };
                  inner.appendChild(im);
                  slide.appendChild(inner);
                  carousel.appendChild(slide);
                });
                body.appendChild(carousel);

                var h = document.createElement('div');
                h.className = 'aptTitle';
                h.textContent = String(title || 'דירה');
                body.appendChild(h);

                var meta = document.createElement('div');
                meta.className = 'aptMeta';
                var addrText = String(address || '').trim();
                var cityText = String(city || '').trim();
                meta.textContent = addrText;
                if (cityText) {
                  var span = document.createElement('span');
                  span.className = 'aptMetaMuted';
                  span.textContent = (addrText ? ' • ' : '') + cityText;
                  meta.appendChild(span);
                }
                body.appendChild(meta);

                // Tap popup to open apartment details (but don't trigger on swipe)
                var startX = 0, startY = 0, startT = 0;
                function sendOpen() {
                  var idStr = String(aptId || '').trim();
                  if (!idStr) return;
                  var payload = JSON.stringify({ type: 'OPEN_APARTMENT', id: idStr });
                  try {
                    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                      window.ReactNativeWebView.postMessage(payload);
                    }
                  } catch (_) {}
                  try {
                    if (window.parent && window.parent !== window && window.parent.postMessage) {
                      window.parent.postMessage(payload, '*');
                    }
                  } catch (_) {}
                }
                function onStart(x, y) { startX = x; startY = y; startT = Date.now(); }
                function onEnd(x, y) {
                  var dx = Math.abs(x - startX);
                  var dy = Math.abs(y - startY);
                  var dt = Date.now() - startT;
                  if (dx <= 8 && dy <= 8 && dt <= 450) sendOpen();
                }
                root.addEventListener('touchstart', function (ev) {
                  if (!ev || !ev.touches || !ev.touches[0]) return;
                  onStart(ev.touches[0].clientX, ev.touches[0].clientY);
                }, { passive: true });
                root.addEventListener('touchend', function (ev) {
                  if (!ev || !ev.changedTouches || !ev.changedTouches[0]) return;
                  onEnd(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY);
                }, { passive: true });
                root.addEventListener('mousedown', function (ev) { onStart(ev.clientX, ev.clientY); });
                root.addEventListener('mouseup', function (ev) { onEnd(ev.clientX, ev.clientY); });
                root.appendChild(body);

                new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
                  .setLngLat(e.lngLat)
                  .setDOMContent(root)
                  .addTo(map);
              });

              map.on('mouseenter', 'apt-circles', function () { map.getCanvas().style.cursor = 'pointer'; });
              map.on('mouseleave', 'apt-circles', function () { map.getCanvas().style.cursor = ''; });
            } catch (_) {}
          });
        } catch (e) {
          document.getElementById('map').outerHTML =
            '<div class="error">שגיאה בטעינת המפה</div>';
        }
      })();
    </script>
  </body>
</html>`;
}


