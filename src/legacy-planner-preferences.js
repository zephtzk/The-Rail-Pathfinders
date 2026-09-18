import {createPreferencesStore,normalizePreferences} from './preferences.js';

// Legacy forms expose only a subset of Settings. Keep the other accepted values
// in their submitted input, while explicit form edits take precedence.
export function legacyPlannerInput(fields = {}, preferences = {}) {
  const merged = {...preferences,...fields.preferences,...fields};
  if (Object.hasOwn(fields,'walkingLimit')) merged.walkingLimitMinutes = fields.walkingLimit;
  if (Object.hasOwn(fields,'detourLimit')) merged.maxExtraMinutes = fields.detourLimit;
  const result = {...fields,...normalizePreferences(merged)};
  delete result.preferences; // An old nested snapshot must not override later edits.
  return result;
}

export function legacyPlannerSettings() {
  try {return createPreferencesStore(globalThis.localStorage).read().preferences;}
  catch {return normalizePreferences();}
}
