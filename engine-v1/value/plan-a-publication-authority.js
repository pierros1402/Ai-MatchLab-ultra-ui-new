import fs from "node:fs";

import {
  isPlanAObservationDay,
  readPlanAObservationDay,
  rowsFromPlanAPayload
} from "./plan-a-observation.js";

function normalizedPublicationPayload(dayKey, payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const picks = rowsFromPlanAPayload(payload);

  return {
    ...payload,
    ok: payload.ok !== false,
    date: String(dayKey || payload.date || "").trim(),
    count: picks.length,
    picks
  };
}

export function selectPlanAPublicationPayload({
  dayKey,
  currentPayload,
  observation = null,
  observationFileExists = false
} = {}) {
  const day = String(dayKey || "").trim();

  if (!isPlanAObservationDay(day)) {
    return {
      ok: true,
      authority: "current_value_artifact",
      observationRequired: false,
      payload: normalizedPublicationPayload(
        day,
        currentPayload
      )
    };
  }

  if (
    observation?.ok === true &&
    observation?.payload
  ) {
    return {
      ok: true,
      authority: "frozen_plan_a_observation",
      observationRequired: true,
      observationSignature:
        observation.observationSignature ||
        observation.signature ||
        observation.payload?.observationSignature ||
        null,
      payload: normalizedPublicationPayload(
        day,
        observation.payload
      )
    };
  }

  if (observationFileExists) {
    const reason =
      observation?.reason ||
      "invalid_existing_plan_a_observation";

    throw new Error(
      `plan_a_publication_authority_invalid_observation:${day}:${reason}`
    );
  }

  return {
    ok: true,
    authority: "current_value_artifact_first_freeze",
    observationRequired: true,
    payload: normalizedPublicationPayload(
      day,
      currentPayload
    )
  };
}

export function resolvePlanAPublicationPayload(
  dayKey,
  currentPayload
) {
  const day = String(dayKey || "").trim();

  if (!isPlanAObservationDay(day)) {
    return selectPlanAPublicationPayload({
      dayKey: day,
      currentPayload
    });
  }

  const observation =
    readPlanAObservationDay(day);

  const observationFileExists =
    Boolean(
      observation?.file &&
      fs.existsSync(observation.file)
    );

  return selectPlanAPublicationPayload({
    dayKey: day,
    currentPayload,
    observation,
    observationFileExists
  });
}
