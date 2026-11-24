import type { ImageSourcePropType } from 'react-native';

export const GESTURE_PREVIEW_ASSETS: Readonly<Record<string, ImageSourcePropType>> = Object.freeze({
  body_circle: require('../../assets/gestures/body_circle.gif'),
  body_sway: require('../../assets/gestures/body_sway.gif'),
  breathing_squat: require('../../assets/gestures/breathing_squat.gif'),
  celebrate: require('../../assets/gestures/celebrate.gif'),
  curious_look: require('../../assets/gestures/curious_look.gif'),
  curious_peek: require('../../assets/gestures/curious_peek.gif'),
  dance: require('../../assets/gestures/dance.gif'),
  diagonal_curtsy: require('../../assets/gestures/diagonal_curtsy.gif'),
  figure8: require('../../assets/gestures/figure8.gif'),
  flip_play_bow: require('../../assets/gestures/flip_play_bow.gif'),
  greet_stand: require('../../assets/gestures/greet_stand.gif'),
  happy_bounce: require('../../assets/gestures/happy_bounce.gif'),
  head_tilt: require('../../assets/gestures/head_tilt.gif'),
  hello: require('../../assets/gestures/hello.gif'),
  hip_pop: require('../../assets/gestures/hip_pop.gif'),
  inspect_down: require('../../assets/gestures/inspect_down.gif'),
  lie_down: require('../../assets/gestures/lie_down.gif'),
  listen_tilt: require('../../assets/gestures/listen_tilt.gif'),
  look_back: require('../../assets/gestures/look_back.gif'),
  new_year_bow: require('../../assets/gestures/new_year_bow.gif'),
  nod_yes: require('../../assets/gestures/nod_yes.gif'),
  offer_paw: require('../../assets/gestures/offer_paw.gif'),
  play_bow: require('../../assets/gestures/play_bow.gif'),
  ready_alert: require('../../assets/gestures/ready_alert.gif'),
  shake: require('../../assets/gestures/shake.gif'),
  shake_body: require('../../assets/gestures/shake_body.gif'),
  shake_no: require('../../assets/gestures/shake_no.gif'),
  side_dip: require('../../assets/gestures/side_dip.gif'),
  sit: require('../../assets/gestures/sit.gif'),
  sit_greet: require('../../assets/gestures/sit_greet.gif'),
  sit_wait: require('../../assets/gestures/sit_wait.gif'),
  stand_idle: require('../../assets/gestures/stand_idle.gif'),
  step_back: require('../../assets/gestures/step_back.gif'),
  stretch: require('../../assets/gestures/stretch.gif'),
  wiggle: require('../../assets/gestures/wiggle.gif'),
});

export function getGesturePreviewAsset(key?: string | null): ImageSourcePropType | undefined {
  if (!key) return undefined;
  return GESTURE_PREVIEW_ASSETS[key];
}
