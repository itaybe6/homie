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

import { palette } from '@/lib/theme';

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
}): string {
  const hasExplicitCenter = Array.isArray(params.center) && params.center.length === 2;
  const center = params.center ?? [34.7818, 32.0853];
  const zoom = typeof params.zoom === 'number' ? params.zoom : 11;
  const token = params.accessToken;
  // Use Mapbox Standard style which has built-in Hebrew language support
  const styleUrl = params.styleUrl || 'mapbox://styles/mapbox/standard';
  const points = params.points ?? { type: 'FeatureCollection', features: [] };
  const pointColor = (params.pointColor || '').trim() || '#8B5CF6'; // default: purple
  const labelColor = '#6D28D9'; // purple (Tailwind violet-700)
  const pulsePoints = !!params.pulsePoints;
  const userLocation = params.userLocation;
  const userDotColor = palette.successGreen;

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
          var userLocation = ${JSON.stringify(userLocation ?? null)};

          var map = new mapboxgl.Map({
            container: 'map',
            style: styleUrl,
            center: center,
            zoom: zoom,
          });

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
            // Primary target for this task: Hebrew
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
            if (fallbackLang) {
              coalesce.push(['get', 'name_' + fallbackLang]);
              coalesce.push(['get', 'name:' + fallbackLang]);
            }
            coalesce.push(['get', 'name']);
            coalesce.push(['get', 'name_en']);
            coalesce.push(['get', 'name:en']);
            coalesce.push(['get', 'name_local']);
            coalesce.push(['get', 'name:latin']);
            coalesce.push(['get', 'name_int']);

            try {
              // For Mapbox Standard style (v3+), this is the preferred API if present.
              if (map.setConfigProperty) {
                map.setConfigProperty('basemap', 'language', targetLang);
              }
            } catch (_) {}

            try {
              var style = map.getStyle && map.getStyle();
              var layers = style && style.layers;
              if (!layers || !layers.length) return;

              var changed = 0;
              for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                // Only target label layers: symbol layers that actually define a text-field.
                if (!layer || layer.type !== 'symbol') continue;
                var layout = layer.layout || {};
                if (layout['text-field'] == null) continue;
                try {
                  map.setLayoutProperty(layer.id, 'text-field', coalesce);
                  changed++;
                } catch (_) {}
              }

              // Don't "lock" after first run — some styles (and iOS WebView) may surface
              // more layers progressively; we'll keep trying on idle/style events (throttled).
            } catch (_) {}
          }

          var __langApplyScheduled = false;
          var __langLastAppliedAt = 0;

          function __applyHebrewLabelsNow() {
            __langApplyScheduled = false;
            __langLastAppliedAt = Date.now();
            __applyLabelLanguage('he');
          }

          function __scheduleHebrewLabels() {
            if (__langApplyScheduled) return;
            // throttle: max once per ~250ms
            try {
              if (__langLastAppliedAt && (Date.now() - __langLastAppliedAt) < 250) return;
            } catch (_) {}
            __langApplyScheduled = true;
            try {
              requestAnimationFrame(__applyHebrewLabelsNow);
            } catch (_) {
              setTimeout(__applyHebrewLabelsNow, 0);
            }
          }

          var __labelsApplied = false;
          var __applyScheduled = false;

          function applyPurpleLabels() {
            __applyScheduled = false;
            try {
              var style = map.getStyle && map.getStyle();
              if (!style || !style.layers) return;
              var changed = 0;
              for (var i = 0; i < style.layers.length; i++) {
                var layer = style.layers[i];
                if (!layer || layer.type !== 'symbol') continue;
                try {
                  map.setPaintProperty(layer.id, 'text-color', ${JSON.stringify(labelColor)});
                  map.setPaintProperty(layer.id, 'text-halo-color', '#FFFFFF');
                  map.setPaintProperty(layer.id, 'text-halo-width', 1.2);
                  changed++;
                } catch (_) {}
              }
              if (changed > 0) __labelsApplied = true;
            } catch (_) {}
          }

          function scheduleApply() {
            if (__labelsApplied || __applyScheduled) return;
            __applyScheduled = true;
            try {
              requestAnimationFrame(applyPurpleLabels);
            } catch (_) {
              setTimeout(applyPurpleLabels, 0);
            }
          }

          map.on('style.load', function () { __labelsApplied = false; scheduleApply(); });
          map.on('styledata', function () { __labelsApplied = false; scheduleApply(); });
          map.on('idle', function () { scheduleApply(); });

          // Re-apply language because Mapbox Standard may add/update layers after initial load.
          map.on('style.load', function () { __scheduleHebrewLabels(); });
          map.on('styledata', function () { __scheduleHebrewLabels(); });
          map.on('idle', function () { __scheduleHebrewLabels(); });

          map.on('load', function () {
            try {
              // Language: wait for initial load, then rewrite label layers.
              __scheduleHebrewLabels();

              scheduleApply();
              if (userLocation && Array.isArray(userLocation) && userLocation.length === 2) {
                map.addSource('user-location', {
                  type: 'geojson',
                  data: {
                    type: 'FeatureCollection',
                    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: userLocation }, properties: {} }]
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
              }

              var hasApts = !!(points && points.features && points.features.length);
              if (hasApts) {
                map.addSource('apartments', { type: 'geojson', data: points });
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

              map.on('click', 'apt-circles', function (e) {
                var f = e.features[0];
                var props = f.properties || {};
                var imageUrls = [];
                try { imageUrls = JSON.parse(props.image_urls_json || '[]'); } catch (_) {}
                if (imageUrls.length === 0 && props.image_url) imageUrls = [props.image_url];
                if (imageUrls.length === 0) imageUrls = ['https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'];

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
                var h = document.createElement('div'); h.className = 'aptTitle'; h.textContent = props.title || 'דירה'; body.appendChild(h);
                var meta = document.createElement('div'); meta.className = 'aptMeta'; meta.textContent = props.address || '';
                if (props.city) { var s = document.createElement('span'); s.className = 'aptMetaMuted'; s.textContent = (props.address ? ' • ' : '') + props.city; meta.appendChild(s); }
                body.appendChild(meta);
                root.appendChild(body);

                var startX, startY, startT;
                function onEnd(x, y) {
                  if (Math.abs(x-startX) <= 8 && Math.abs(y-startY) <= 8 && (Date.now()-startT) <= 450) {
                    var payload = JSON.stringify({ type: 'OPEN_APARTMENT', id: props.id });
                    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
                    if (window.parent && window.parent.postMessage) window.parent.postMessage(payload, '*');
                  }
                }
                root.onmousedown = function(e) { startX=e.clientX; startY=e.clientY; startT=Date.now(); };
                root.onmouseup = function(e) { onEnd(e.clientX, e.clientY); };
                root.ontouchstart = function(e) { startX=e.touches[0].clientX; startY=e.touches[0].clientY; startT=Date.now(); };
                root.ontouchend = function(e) { onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY); };

                new mapboxgl.Popup({ closeButton: true }).setLngLat(e.lngLat).setDOMContent(root).addTo(map);
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
