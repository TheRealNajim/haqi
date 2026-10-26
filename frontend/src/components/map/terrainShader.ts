/**
 * Terrain shader.
 *
 * The mesh is a displaced grid; all fine detail (normals, ambient occlusion,
 * cast shadows) is derived from the elevation texture, so the silhouette stays
 * light while the surface still reads as a sculpted relief.
 *
 * Nothing here is an air-quality measurement: the colour map is artistic and
 * the AQI layer is a separate component.
 */

export const terrainVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const terrainFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uHeight;
  uniform sampler2D uColour;
  uniform sampler2D uIds;
  uniform vec4 uHeightRect;   // minX, minZ, width, depth in scene units
  uniform vec2 uHeightTexel;  // 1 / height texture size
  uniform vec2 uIdTexel;      // 1 / id texture size
  uniform vec2 uWorldSize;    // scene width, depth
  uniform vec3 uBackground;
  uniform vec3 uSun;
  uniform float uRelief;
  uniform float uSelectedId;
  uniform float uHoverId;
  uniform float uStateGlow;

  varying vec2 vUv;
  varying vec3 vWorld;

  const int SHADOW_STEPS = 8;

  float rawHeight(vec2 uv) {
    return texture2D(uHeight, clamp(uv, vec2(0.0005), vec2(0.9995))).r;
  }

  float relief(float sampleHeight) {
    return uRelief * pow(clamp(sampleHeight, 0.0, 1.0), 1.35);
  }

  vec2 heightUv(vec3 point) {
    return vec2(
      (point.x - uHeightRect.x) / uHeightRect.z,
      (point.z - uHeightRect.y) / uHeightRect.w
    );
  }

  /**
   * Soft shadow ray-marched through the heightfield. This is what gives the
   * relief its sculpted contact shading, and casts land shadows onto the
   * paper-white ocean exactly as a physical model would.
   */
  float terrainShadow(vec3 point, vec3 normal) {
    // Lift the ray off the surface so a flat plain is not shadowed by itself.
    vec3 origin = point + normal * 0.14;
    float t = 0.05;
    float shade = 1.0;
    for (int i = 0; i < SHADOW_STEPS; i++) {
      vec3 q = origin + uSun * t;
      vec2 uv = heightUv(q);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float ground = relief(rawHeight(uv));
      float rayHeight = origin.y + uSun.y * t;
      shade = min(shade, smoothstep(0.0, 0.14, rayHeight - ground));
      // A short march only: this is the soft contact shadow of the relief, not
      // a planetary terminator. Long marches grey out the whole ocean.
      t *= 1.38;
    }
    return shade;
  }

  /**
   * The soft grey halo a physical relief casts on its paper ground.
   * Sampled from the land mask down-light, not from a shadow map.
   */
  float paperShadow(vec3 point) {
    float shade = 0.0;
    vec3 side = normalize(vec3(-uSun.z, 0.0, uSun.x));
    for (int i = 0; i < 6; i++) {
      float d = 0.05 + float(i) * 0.08;
      float wet = 1.0 - d / 0.62;
      vec2 uvA = heightUv(point + uSun * d + side * 0.035);
      vec2 uvB = heightUv(point + uSun * d - side * 0.035);
      float landA = smoothstep(0.0, 0.0007, rawHeight(uvA));
      float landB = smoothstep(0.0, 0.0007, rawHeight(uvB));
      shade = max(shade, (landA + landB) * 0.5 * wet);
    }
    return shade;
  }

  void main() {
    vec2 globalUv = vec2(vWorld.x / uWorldSize.x + 0.5, vWorld.z / uWorldSize.y + 0.5);

    float h = rawHeight(vUv);
    float surface = relief(h);
    float texelX = uHeightTexel.x;
    float texelY = uHeightTexel.y;

    // Sample the slopes over a few texels: reads as sculpted clay rather than
    // per-pixel elevation noise.
    vec2 slopeOffset = vec2(texelX, texelY) * 2.5;
    float hW = relief(rawHeight(vUv - vec2(slopeOffset.x, 0.0)));
    float hE = relief(rawHeight(vUv + vec2(slopeOffset.x, 0.0)));
    float hN = relief(rawHeight(vUv - vec2(0.0, slopeOffset.y)));
    float hS = relief(rawHeight(vUv + vec2(0.0, slopeOffset.y)));

    float worldPerTexelX = 2.0 * uHeightRect.z * slopeOffset.x;
    float worldPerTexelY = 2.0 * uHeightRect.w * slopeOffset.y;

    // v grows southwards, so +z is downhill towards the south.
    vec3 normal = normalize(vec3(
      1.75 * (hW - hE) / max(worldPerTexelX, 1e-5),
      1.0,
      1.75 * (hN - hS) / max(worldPerTexelY, 1e-5)
    ));

    // Broad concavity darkening: valleys read as valleys, not just slopes.
    vec2 wide = vec2(texelX, texelY) * 6.0;
    float hNW = relief(rawHeight(vUv - wide));
    float hNE = relief(rawHeight(vUv + vec2(wide.x, -wide.y)));
    float hSW = relief(rawHeight(vUv + vec2(-wide.x, wide.y)));
    float hSE = relief(rawHeight(vUv + wide));
    float surround = (hNW + hNE + hSW + hSE) * 0.25;
    float ao = clamp(1.0 - max(0.0, surround - surface) * 0.7, 0.82, 1.0);

    float slope = clamp(length(vec2(hE - hW, hS - hN)) * 5.0, 0.0, 1.0);

    // --- artistic land colour -------------------------------------------
    // Warmth (how terracotta the highlands should read) rides in the id map's
    // blue channel, so the colour texture's own alpha never has to survive the
    // canvas round-trip.
    vec4 palette = texture2D(uColour, globalUv);
    vec4 idSample = texture2D(uIds, globalUv);
    float warmth = idSample.b;
    float elevationTone = smoothstep(0.006, 0.4, h);
    vec3 highland = mix(vec3(0.925, 0.933, 0.905), vec3(0.80, 0.43, 0.30), warmth);
    vec3 colour = mix(palette.rgb, highland, elevationTone * (0.42 + 0.58 * warmth));

    // Snow and bare rock on the highest peaks outside the warm highlands.
    float snow = smoothstep(0.36, 0.6, h) * (1.0 - warmth * 0.85);
    colour = mix(colour, vec3(0.945, 0.945, 0.93), snow * 0.75);

    // Slopes pick up a touch more pigment; flats stay papery.
    colour *= 1.0 - slope * 0.12;
    colour = mix(colour, vec3(dot(colour, vec3(0.299, 0.587, 0.114))), 0.08);

    // Coastal shelf: a pale rim where land meets water.
    float shore = 1.0 - smoothstep(0.0, 0.012, h);
    colour = mix(colour, vec3(0.972, 0.964, 0.936), shore * 0.5);

    // --- country focus ---------------------------------------------------
    float countryId = floor(idSample.r * 255.0 + 0.5);
    float selected = step(0.5, 1.0 - abs(countryId - uSelectedId)) * step(0.5, countryId);
    float hovered = step(0.5, 1.0 - abs(countryId - uHoverId)) * step(0.5, countryId);

    float weight = max(selected, hovered * 0.7);
    colour = mix(colour, vec3(0.99, 0.93, 0.79), weight * 0.14);

    if (weight > 0.0) {
      // One-pixel outline, sized by the screen rather than the texture, so
      // zooming into a small country never fills it with its own border.
      vec2 pixel = fwidth(globalUv);
      vec2 dx = vec2(pixel.x * 1.4, 0.0);
      vec2 dy = vec2(0.0, pixel.y * 1.4);
      float a = floor(texture2D(uIds, globalUv + dx).r * 255.0 + 0.5);
      float b = floor(texture2D(uIds, globalUv - dx).r * 255.0 + 0.5);
      float c = floor(texture2D(uIds, globalUv + dy).r * 255.0 + 0.5);
      float d = floor(texture2D(uIds, globalUv - dy).r * 255.0 + 0.5);
      float edge = max(max(step(0.5, abs(a - countryId)), step(0.5, abs(b - countryId))),
                       max(step(0.5, abs(c - countryId)), step(0.5, abs(d - countryId))));
      colour = mix(colour, vec3(0.17, 0.15, 0.11), edge * weight * 0.6);
    }

    // The regional patch gets a barely-there lift so it never z-fights.
    colour = mix(colour, colour * 1.005 + 0.002, uStateGlow);

    // --- light -----------------------------------------------------------
    float shadow = terrainShadow(vec3(vWorld.x, surface, vWorld.z), normal);
    float diffuse = clamp(dot(normal, uSun), 0.0, 1.0);
    float sky = clamp(0.5 + 0.5 * normal.y, 0.0, 1.0);

    vec3 ambientTint = vec3(0.955, 0.968, 1.0);
    vec3 sunTint = vec3(1.03, 1.0, 0.955);
    vec3 lit = colour * ((0.66 + 0.10 * sky) * ambientTint * ao + diffuse * mix(0.42, 1.0, shadow) * 0.42 * sunTint);

    // --- paper ocean ------------------------------------------------------
    float land = smoothstep(0.0, 0.0012, h);
    // Paper ocean: the page colour, with the land's soft contact shadow.
    float halo = paperShadow(vec3(vWorld.x, 0.0, vWorld.z));
    vec3 ocean = uBackground * (1.0 - halo * 0.24 - (1.0 - shadow) * 0.06);
    vec3 finalColour = mix(ocean, lit, land);

    gl_FragColor = vec4(finalColour, 1.0);
  }
`;
