import * as THREE from 'three';

export interface BuildingShaderUniforms {
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uHemiSky: { value: THREE.Color };
  uHemiGround: { value: THREE.Color };
  uShadowTint: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uWindowGlow: { value: number };
  uWallColor: { value: THREE.Color };
  uRoofColor: { value: THREE.Color };
  uBuildingSeed: { value: number };
  uBuildingHeight: { value: number };
  uIsLandmark: { value: number };
  uFacadeKind: { value: number };
  uHalfSize: { value: number };
}

export function createBuildingMaterial(params: {
  wallColor: string;
  roofColor: string;
  seed: number;
  height: number;
  isLandmark?: boolean;
  // 0 = plaster_modern, 1 = brick_canal, 2 = traditional_timber, 3 = stone_classic, 4 = glass_tower
  facadeKind?: number;
  halfSize?: number;
}): THREE.ShaderMaterial {
  const uniforms: BuildingShaderUniforms = {
    uSunDir: { value: new THREE.Vector3(0.5, 0.78, 0.38).normalize() },
    uSunColor: { value: new THREE.Color('#fff9ed') },
    uHemiSky: { value: new THREE.Color('#f5f9ff') },
    uHemiGround: { value: new THREE.Color('#e3d8c6') },
    uShadowTint: { value: new THREE.Color('#8591ab') },
    uFogColor: { value: new THREE.Color('#f6f2e8') },
    uWindowGlow: { value: 0.02 },
    uWallColor: { value: new THREE.Color(params.wallColor) },
    uRoofColor: { value: new THREE.Color(params.roofColor) },
    uBuildingSeed: { value: params.seed },
    uBuildingHeight: { value: params.height },
    uIsLandmark: { value: params.isLandmark ? 1.0 : 0.0 },
    uFacadeKind: { value: params.facadeKind ?? 0.0 },
    uHalfSize: { value: params.halfSize ?? 110.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;

      void main() {
        vLocalPos = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHemiSky;
      uniform vec3 uHemiGround;
      uniform vec3 uShadowTint;
      uniform vec3 uFogColor;
      uniform float uWindowGlow;
      uniform vec3 uWallColor;
      uniform vec3 uRoofColor;
      uniform float uBuildingSeed;
      uniform float uBuildingHeight;
      uniform float uIsLandmark;
      uniform float uFacadeKind;
      uniform float uHalfSize;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 N = normalize(vWorldNormal);
        float isRoof = step(0.45, abs(N.y));
        float nightWeight = clamp(uWindowGlow, 0.0, 1.0);

        vec3 baseCol = mix(uWallColor, uRoofColor, isRoof);

        // Soft paper-model vertical gradient + gentle ground contact AO
        float heightNorm = clamp(vLocalPos.y / max(uBuildingHeight, 1.0), 0.0, 1.0);
        float contactAO = mix(0.90, 1.0, smoothstep(0.0, 2.8, vLocalPos.y));
        baseCol *= mix(0.96, 1.04, heightNorm) * contactAO;

        // High-key gouache lighting: sunlit pastel vs cool slate-lavender shade (never black/muddy)
        float ndl = dot(N, normalize(uSunDir));
        float halfLambert = ndl * 0.5 + 0.5;
        float lightBand = smoothstep(0.18, 0.78, halfLambert);

        float dayShade = mix(0.84, 1.05, lightBand);
        float nightShade = mix(0.56, 0.84, lightBand);
        float shadeScale = mix(dayShade, nightShade, nightWeight);

        vec3 litColor = baseCol * shadeScale;
        vec3 sunWarm = mix(vec3(1.0), uSunColor, 0.34);
        litColor *= mix(vec3(1.0), sunWarm, lightBand);

        // Cool lavender-slate watercolor shadow wash on shaded faces
        vec3 coolWash = mix(uShadowTint * 1.18, vec3(0.92, 0.94, 0.98), 0.42);
        litColor = mix(litColor * coolWash, litColor, mix(0.28, 1.0, lightBand));

        // Gentle warm ground-bounce fill on shaded faces so gouache shadows stay luminous
        vec3 bounce = uHemiGround * baseCol * 0.10 * (1.0 - lightBand) * (1.0 - nightWeight * 0.65);
        litColor += bounce;

        // Nighttime soft sky bounce so roof/walls stay readable
        litColor = mix(litColor, litColor * mix(uHemiSky, vec3(1.0), 0.32), nightWeight * 0.45);

        // Subtle roof tile rib texture on pitched/sloped roofs (non-flat N.y < 0.98)
        if (isRoof > 0.5) {
          float isSloped = 1.0 - smoothstep(0.94, 0.995, abs(N.y));
          if (isSloped > 0.05) {
            float ribCoord = (vWorldPos.x * 0.78 + vWorldPos.z * 0.62) * 1.65;
            float ribWave = smoothstep(0.32, 0.5, abs(fract(ribCoord) - 0.5));
            litColor *= mix(1.0, 0.91 + 0.14 * ribWave, isSloped);
          } else {
            // Flat roof subtle gravel wash + pale perimeter sheen
            float grain = hash21(floor(vWorldPos.xz * 1.8));
            litColor *= (0.97 + 0.05 * grain);
          }
        }

        // Architectural Facade Windows & Floor Cornices on Vertical Walls
        // uFacadeKind: 0 = plaster_modern, 1 = brick_canal, 2 = traditional_timber, 3 = stone_classic, 4 = glass_tower
        if (isRoof < 0.5) {
          float horizCoord = abs(N.x) > abs(N.z) ? vWorldPos.z : vWorldPos.x;
          bool isBrickCanal = uFacadeKind > 0.5 && uFacadeKind < 1.5;
          bool isTimber = uFacadeKind >= 1.5 && uFacadeKind < 2.5;
          bool isStoneClassic = uFacadeKind >= 2.5 && uFacadeKind < 3.5;
          bool isGlassTower = uFacadeKind >= 3.5;

          float floorH = isBrickCanal ? 3.15 : isTimber ? 3.2 : isStoneClassic ? 3.8 : isGlassTower ? 3.5 : 3.45;
          float bayW = isBrickCanal ? 2.45 : isTimber ? 2.55 : isStoneClassic ? 3.2 : isGlassTower ? 2.8 : 3.6;

          float localY = max(0.0, vLocalPos.y);
          float maxWinY = max(uBuildingHeight - 0.9, 1.4);
          float inWinBand = step(0.85, localY) * step(localY, maxWinY);

          float floorIdx = floor(localY / floorH);
          float bayIdx = floor(horizCoord / bayW);

          float fy = fract(localY / floorH);
          float fx = fract(horizCoord / bayW);

          // Horizontal cornice / spandrel band / ashlar stone coursing
          if (localY > 1.2 && localY < uBuildingHeight - 0.5) {
            if (isGlassTower) {
              float spandrel = step(fy, 0.14);
              vec3 spandrelCol = mix(litColor * 0.88, vec3(0.70, 0.76, 0.82), 0.55);
              litColor = mix(litColor, spandrelCol, spandrel * (1.0 - nightWeight * 0.45));
            } else if (!isTimber) {
              float cornice = step(fy, isStoneClassic ? 0.12 : 0.09);
              vec3 corniceTint = isStoneClassic ? vec3(0.95, 0.92, 0.86) : vec3(0.94, 0.91, 0.86);
              vec3 corniceCol = mix(litColor * 1.08, corniceTint, isStoneClassic ? 0.48 : 0.35);
              litColor = mix(litColor, corniceCol, cornice * (1.0 - nightWeight * 0.5));
            }
          }

          // Brick / ashlar micro-grain on canal brick and classic stone facades
          if (isBrickCanal) {
            float brickRand = hash21(vec2(floor(horizCoord * 1.6), floor(localY * 2.8)));
            litColor *= (0.95 + 0.09 * brickRand);
          } else if (isStoneClassic) {
            float courseLine = step(fract(localY * 1.15), 0.07);
            float stoneRand = hash21(vec2(floor(horizCoord * 0.65), floor(localY * 1.15)));
            litColor *= (0.97 + 0.05 * stoneRand) * mix(1.0, 0.94, courseLine * 0.6);
          }

          // Clean Architectural Window Rectangle
          float wPadX = isGlassTower ? 0.08 : isTimber ? 0.16 : isBrickCanal ? 0.20 : isStoneClassic ? 0.22 : 0.25;
          float wPadY = isGlassTower ? 0.14 : isTimber ? 0.16 : isBrickCanal ? 0.16 : isStoneClassic ? 0.20 : 0.24;
          float wx = step(wPadX, fx) * step(fx, 1.0 - wPadX);
          float wy = step(wPadY, fy) * step(fy, 1.0 - wPadY);
          float isWin = wx * wy * inWinBand;

          // Thin windowsill & stone lintel
          float sill = step(wPadX - 0.045, fx) * step(fx, 1.0 - wPadX + 0.045) *
                       step(wPadY - 0.06, fy) * step(fy, wPadY) * inWinBand;
          float lintel = isBrickCanal
            ? step(wPadX - 0.03, fx) * step(fx, 1.0 - wPadX + 0.03) *
              step(1.0 - wPadY, fy) * step(fy, 1.0 - wPadY + 0.05) * inWinBand
            : 0.0;
          if ((sill > 0.5 || lintel > 0.5) && !isGlassTower) {
            vec3 trimTint = isBrickCanal ? vec3(0.95, 0.94, 0.90) : vec3(0.93, 0.90, 0.85);
            litColor = mix(litColor, trimTint, 0.62 * (1.0 - nightWeight * 0.4));
          }

          if (isWin > 0.5) {
            float r = hash21(vec2(bayIdx + uBuildingSeed * 17.3, floorIdx + uBuildingSeed * 31.7));
            float glowChance = uIsLandmark > 0.5 ? 0.92 : 0.58;
            float isLit = step(1.0 - glowChance, r);

            // Daytime glass: soft dusty slate-blue or sky-curtain glass or warm timber screen
            float glassGrad = mix(0.88, 1.08, smoothstep(wPadY, 1.0 - wPadY, fy));
            vec3 dayGlassBase = isTimber
              ? vec3(0.76, 0.73, 0.66)
              : isGlassTower
                ? vec3(0.66, 0.77, 0.84)
                : vec3(0.60, 0.69, 0.77);
            vec3 dayGlass = dayGlassBase * glassGrad * (0.90 + 0.14 * lightBand);

            // Night warm golden window glow
            vec3 nightWarm = mix(vec3(1.0, 0.85, 0.48), vec3(1.0, 0.71, 0.34), fract(r * 7.13));
            vec3 offNightGlass = vec3(0.32, 0.38, 0.52);

            float nw = smoothstep(0.08, 0.92, nightWeight);
            vec3 winCol = mix(
              dayGlass,
              mix(offNightGlass, nightWarm, isLit),
              nw
            );

            // Center vertical mullion & outer frame ink border (crisp ivory on Dutch brick canals!)
            float borderW = isBrickCanal ? 0.05 : 0.035;
            float border = step(fx, wPadX + borderW) + step(1.0 - wPadX - borderW, fx) +
                           step(fy, wPadY + borderW) + step(1.0 - wPadY - borderW, fy);
            float mullion = step(abs(fx - 0.5), isBrickCanal ? 0.036 : 0.03);
            float transom = (isBrickCanal || isGlassTower) ? step(abs(fy - 0.52), 0.028) : 0.0;

            vec3 frameCol = isTimber
              ? vec3(0.45, 0.25, 0.20)
              : isBrickCanal
                ? vec3(0.95, 0.94, 0.91)
                : isStoneClassic
                  ? vec3(0.44, 0.41, 0.38)
                  : isGlassTower
                    ? vec3(0.32, 0.36, 0.44)
                    : vec3(0.38, 0.36, 0.35);

            if (border > 0.5 || mullion > 0.5 || transom > 0.5) {
              float frameMix = isBrickCanal
                ? (nw > 0.4 ? 0.38 : 0.08)
                : (isTimber && nw > 0.4 ? 0.35 : 0.15);
              winCol = mix(frameCol, winCol, frameMix);
            }

            litColor = mix(litColor, winCol, 0.94);
          }
        }

        // Gentle atmospheric edge fade matched to diorama halfSize
        float dist = max(abs(vWorldPos.x), abs(vWorldPos.z));
        float edgeFade = smoothstep(uHalfSize * 0.92, uHalfSize * 1.40, dist);
        litColor = mix(litColor, uFogColor, edgeFade * 0.22);

        gl_FragColor = vec4(litColor, 1.0);
      }
    `,
  });
}

export interface WaterShaderUniforms {
  uTime: { value: number };
  uWaterColor: { value: THREE.Color };
  uRippleColor: { value: THREE.Color };
  uShoreColor: { value: THREE.Color };
  uNightFactor: { value: number };
}

export function createWaterMaterial(): THREE.ShaderMaterial {
  const uniforms: WaterShaderUniforms = {
    uTime: { value: 0 },
    uWaterColor: { value: new THREE.Color('#7eb9c2') },
    uRippleColor: { value: new THREE.Color('#aad8de') },
    uShoreColor: { value: new THREE.Color('#d4ebec') },
    uNightFactor: { value: 0 },
  };

  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    transparent: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uWaterColor;
      uniform vec3 uRippleColor;
      uniform vec3 uShoreColor;
      uniform float uNightFactor;

      varying vec3 vWorldPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(234.12, 567.89));
        p += dot(p, p + 34.12);
        return fract(p.x * p.y);
      }

      void main() {
        vec2 uv = vWorldPos.xz * 0.22;
        vec2 grid = vec2(uv.x * 0.55 + sin(uv.y * 1.3 + uTime * 0.35) * 0.25, uv.y * 1.45);
        vec2 cell = floor(grid);
        vec2 f = fract(grid);

        float rnd = hash21(cell);

        float strokeX = smoothstep(0.18, 0.3, f.x) * (1.0 - smoothstep(0.65, 0.78, f.x));
        float strokeY = smoothstep(0.38, 0.48, f.y) * (1.0 - smoothstep(0.52, 0.62, f.y));
        float show = step(0.60, rnd);
        float pulse = 0.55 + 0.45 * sin(uTime * 1.4 + rnd * 12.0);
        float ripple = strokeX * strokeY * show * pulse;

        vec3 col = mix(uWaterColor, uRippleColor, ripple * 0.78);

        // Watercolor reflection shimmer + pale shore-tint gradient
        float reflectWave = sin(vWorldPos.x * 0.16 + sin(vWorldPos.z * 0.14 + uTime * 0.55) * 1.6) * 0.5 + 0.5;
        float shoreBlend = smoothstep(0.55, 0.98, reflectWave);
        vec3 dayHighlight = mix(uShoreColor, vec3(0.98, 0.96, 0.91), 0.35);
        col = mix(col, dayHighlight, shoreBlend * 0.22 * (1.0 - uNightFactor * 0.6));

        if (uNightFactor > 0.05) {
          float sparkle = step(0.84, fract(rnd * 9.3 + sin(uTime * 0.9 + cell.x) * 0.1));
          vec3 lanternShimmer = vec3(0.98, 0.80, 0.46);
          col = mix(col, lanternShimmer, ripple * sparkle * uNightFactor * 0.62);
          col = mix(col, mix(uShoreColor, lanternShimmer, 0.38), shoreBlend * uNightFactor * 0.16);
        }

        float grad = 0.97 + 0.04 * sin(vWorldPos.x * 0.025 + vWorldPos.z * 0.025);
        gl_FragColor = vec4(col * grad, 1.0);
      }
    `,
  });
}
