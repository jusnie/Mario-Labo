/**
 * surfaces.js — what is under Ernie's feet.
 *
 * Kept out of main.js so the walkthrough test can assert that every place a
 * player can stand maps to a footstep sound that actually exists.
 */
import { LAYOUT } from "./world.js";

export const SURFACE_KINDS = ["gravel", "dirt", "grass", "wood", "concrete"];

export function surfaceAt(x, z) {
  // the sari-sari store's floorboards
  if (x > 6.4 && x < 14.4 && z > -10.4 && z < -1.8) return "wood";
  // hall forecourt and plinth
  if (Math.abs(x) < 15 && z < LAYOUT.hallZ + LAYOUT.hallDepth / 2 + 4.5) return "concrete";
  // the road: compacted gravel and dirt ruts
  if (Math.abs(x) < LAYOUT.roadWidth / 2 + 0.7 && z < LAYOUT.roadStartZ && z > LAYOUT.roadEndZ) {
    return "gravel";
  }
  return "grass";
}
