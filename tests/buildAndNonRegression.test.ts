import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FlugtagGame } from '../src/flugtag/FlugtagGame';
import { SoapboxGame } from '../src/soapbox/SoapboxGame';
import { CoasterGame } from '../src/coaster/CoasterGame';
import { LandingPage } from '../src/ui/LandingPage';
import {
  buildSoapboxMesh,
  buildSoapboxDebrisMeshes,
} from '../src/soapbox/Soapbox3DBuilder';
import { SOAPBOX_PRESETS } from '../src/soapbox/SoapboxPartCatalog';
import {
  SOAPBOX_COURSES,
  SOAPBOX_COURSE_LIST,
  getSoapboxCourse,
} from '../src/soapbox/SoapboxCourses';
import {
  createInitialSoapboxState,
  getSoapboxRoadState,
} from '../src/soapbox/SoapboxPhysicsEngine';

describe('Build Verification & Cross-Game Non-Regression Suite', () => {
  it('exports primary game modes and top-level landing pages without regression', () => {
    expect(FlugtagGame).toBeDefined();
    expect(SoapboxGame).toBeDefined();
    expect(CoasterGame).toBeDefined();
    expect(LandingPage).toBeDefined();
  });

  it('exports complete Soapbox courses definitions with all 4 downhill tracks', () => {
    expect(SOAPBOX_COURSE_LIST).toHaveLength(4);
    expect(SOAPBOX_COURSES.alpine_panorama).toBeDefined();
    expect(SOAPBOX_COURSES.canyon_plunge).toBeDefined();
    expect(SOAPBOX_COURSES.urban_downhill).toBeDefined();
    expect(SOAPBOX_COURSES.extreme_peak).toBeDefined();

    for (const course of SOAPBOX_COURSE_LIST) {
      expect(course.id).toBeDefined();
      expect(course.dropFeet).toBeGreaterThanOrEqual(111.5);
      expect(course.lengthFeet).toBeGreaterThanOrEqual(1000);
      expect(course.avgGradePercent).toBeLessThanOrEqual(-10.0);
    }
  });

  it('buildSoapboxMesh populates corner wheel nodes, bumper node, and topper node for zero-allocation visibility toggling', () => {
    const parentGroup = new THREE.Group();
    const loadout = SOAPBOX_PRESETS[0];

    const craft = buildSoapboxMesh(parentGroup, loadout);
    expect(craft).toBeDefined();
    expect(craft.root).toBeDefined();

    // Corner wheel nodes for individual detachment
    expect(craft.wheelCornerNodes).toBeDefined();
    expect(craft.wheelCornerNodes.wheel_fl).toBeInstanceOf(THREE.Object3D);
    expect(craft.wheelCornerNodes.wheel_fr).toBeInstanceOf(THREE.Object3D);
    expect(craft.wheelCornerNodes.wheel_rl).toBeInstanceOf(THREE.Object3D);
    expect(craft.wheelCornerNodes.wheel_rr).toBeInstanceOf(THREE.Object3D);

    // Aliases
    expect(craft.wheelCornerNodes.fl).toBe(craft.wheelCornerNodes.wheel_fl);
    expect(craft.wheelCornerNodes.fr).toBe(craft.wheelCornerNodes.wheel_fr);
    expect(craft.wheelCornerNodes.rl).toBe(craft.wheelCornerNodes.wheel_rl);
    expect(craft.wheelCornerNodes.rr).toBe(craft.wheelCornerNodes.wheel_rr);

    // Front Bumper & Roof Topper nodes
    expect(craft.bumperNode).toBeInstanceOf(THREE.Object3D);
    expect(craft.topperNode).toBeInstanceOf(THREE.Object3D);
  });

  it('buildSoapboxDebrisMeshes creates authentic 3D cloned meshes for all 6 part slots', () => {
    const loadout = SOAPBOX_PRESETS[0];
    const debrisMeshes = buildSoapboxDebrisMeshes(loadout);

    expect(debrisMeshes).toBeDefined();
    expect(debrisMeshes.wheel_fl).toBeInstanceOf(THREE.Group);
    expect(debrisMeshes.wheel_fr).toBeInstanceOf(THREE.Group);
    expect(debrisMeshes.wheel_rl).toBeInstanceOf(THREE.Group);
    expect(debrisMeshes.wheel_rr).toBeInstanceOf(THREE.Group);
    expect(debrisMeshes.bumper).toBeInstanceOf(THREE.Group);
    expect(debrisMeshes.topper).toBeInstanceOf(THREE.Group);
  });

  it('evaluates road states and initial simulation states across all courses without errors', () => {
    for (const course of SOAPBOX_COURSE_LIST) {
      const state = createInitialSoapboxState(course.id);
      expect(state.courseId).toBe(course.id);
      expect(state.courseLengthFeet).toBe(course.lengthFeet);
      expect(state.attachedParts.wheel_fl).toBe(true);
      expect(state.attachedParts.bumper).toBe(true);
      expect(state.attachedParts.topper).toBe(true);

      // Sample road at key points
      const roadStart = getSoapboxRoadState(0, course.id);
      const roadMid = getSoapboxRoadState(course.lengthFeet / 2, course.id);
      const roadEnd = getSoapboxRoadState(course.lengthFeet, course.id);

      expect(roadStart.yFeet).toBeGreaterThan(roadEnd.yFeet);
      expect(roadMid.yFeet).toBeGreaterThan(roadEnd.yFeet);
      expect(Number.isFinite(roadStart.slopeRad)).toBe(true);
      expect(Number.isFinite(roadMid.slopeRad)).toBe(true);
      expect(Number.isFinite(roadEnd.slopeRad)).toBe(true);
    }
  });
});
