import { describe, it, expect } from 'vitest';
import {
  SOAPBOX_COURSE_LIST,
  SOAPBOX_COURSES,
  SoapboxCourseId,
  getSoapboxCourse,
  getSoapboxRoadElevation,
  getSoapboxRoadGrade,
  getSoapboxRoadHeading,
  getSoapboxRoadCurvature,
} from '../src/soapbox/SoapboxCourses';
import { getSoapboxRoadState } from '../src/soapbox/SoapboxPhysicsEngine';

describe('Soapbox Downhill Course Geometry & Profiles', () => {
  const courseIds: SoapboxCourseId[] = [
    'alpine_panorama',
    'canyon_plunge',
    'urban_downhill',
    'extreme_peak',
  ];

  it('should define all 4 distinct downhill courses in catalog and list', () => {
    expect(SOAPBOX_COURSE_LIST).toHaveLength(4);
    for (const id of courseIds) {
      const course = getSoapboxCourse(id);
      expect(course).toBeDefined();
      expect(course.id).toBe(id);
      expect(course.name.length).toBeGreaterThan(0);
      expect(course.lengthFeet).toBeGreaterThanOrEqual(1000);
      expect(course.dropFeet).toBeGreaterThanOrEqual(111.5);
    }
  });

  describe('Downhill Slope & Grade Monotonicity', () => {
    courseIds.forEach((courseId) => {
      describe(`Course: ${courseId}`, () => {
        const course = SOAPBOX_COURSES[courseId];

        it('guarantees continuous downhill slope G(s) = -dy/ds >= 0.05 (dy/ds <= -0.05) everywhere with zero flat/uphill spots', () => {
          const stepFeet = 2.0;
          const totalLength = course.lengthFeet;
          let minObservedSlope = Infinity;
          let maxObservedDyDs = -Infinity;

          for (let s = 0; s < totalLength; s += stepFeet) {
            const grade = getSoapboxRoadGrade(s, courseId);
            const sNext = Math.min(totalLength, s + stepFeet);
            const y1 = getSoapboxRoadElevation(s, courseId);
            const y2 = getSoapboxRoadElevation(sNext, courseId);
            const finiteDiffDyDs = (y2 - y1) / (sNext - s);

            if (grade < minObservedSlope) minObservedSlope = grade;
            if (finiteDiffDyDs > maxObservedDyDs) maxObservedDyDs = finiteDiffDyDs;

            // Slope must be strictly positive downhill: G(s) = -dy/ds >= 0.05
            expect(grade).toBeGreaterThanOrEqual(0.049);
            // dy/ds must be strictly negative: <= -0.045
            expect(finiteDiffDyDs).toBeLessThanOrEqual(-0.045);
          }

          expect(minObservedSlope).toBeGreaterThanOrEqual(0.05);
          expect(maxObservedDyDs).toBeLessThanOrEqual(-0.045);
        });

        it('guarantees total elevation drop >= 111.5 ft from start to finish', () => {
          const yStart = getSoapboxRoadElevation(0, courseId);
          const yEnd = getSoapboxRoadElevation(course.lengthFeet, courseId);
          const totalDrop = yStart - yEnd;

          expect(totalDrop).toBeGreaterThanOrEqual(111.5);
          expect(totalDrop).toBeCloseTo(course.dropFeet, 0.5);
        });

        it('guarantees average grade <= -10%', () => {
          const yStart = getSoapboxRoadElevation(0, courseId);
          const yEnd = getSoapboxRoadElevation(course.lengthFeet, courseId);
          const avgGrade = ((yEnd - yStart) / course.lengthFeet) * 100;

          expect(avgGrade).toBeLessThanOrEqual(-10.0);
          expect(course.avgGradePercent).toBeLessThanOrEqual(-10.0);
        });

        it('produces bounded, continuous road curvature and road state along course', () => {
          for (let s = 0; s <= course.lengthFeet; s += 25) {
            const curvature = getSoapboxRoadCurvature(s, courseId);
            const heading = getSoapboxRoadHeading(s, courseId);
            const roadState = getSoapboxRoadState(s, courseId);

            expect(Math.abs(curvature)).toBeLessThanOrEqual(0.12);
            expect(Number.isFinite(heading)).toBe(true);
            expect(Number.isFinite(roadState.slopeRad)).toBe(true);
            expect(Number.isFinite(roadState.headingRad)).toBe(true);
          }
        });

        it('defines obstacles with valid positions, lateral bounds, and types', () => {
          expect(course.obstacles.length).toBeGreaterThan(0);
          for (const obs of course.obstacles) {
            expect(obs.sFeet).toBeGreaterThan(0);
            expect(obs.sFeet).toBeLessThan(course.lengthFeet);
            expect(Math.abs(obs.lateralCenterFeet)).toBeLessThanOrEqual(15);
            expect(obs.lengthFeet).toBeGreaterThan(0);
            expect(obs.halfWidthFeet).toBeGreaterThan(0);
            expect(['hay_bale', 'cobble_strip', 'water_slick', 'kicker_jump', 'speed_gate']).toContain(
              obs.type
            );
          }
        });
      });
    });
  });
});
