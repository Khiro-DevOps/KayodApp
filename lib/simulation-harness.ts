/**
 * Sprint 5 Geofence & Bypass Simulation Harness
 * This object structure can be used to mock the 'ClockInModule' state
 * and verify the "The Leave Gate", "The Remote Bypass", and standard boundary workflows.
 */

export const simulationHarness = {
  // 1. THE LEAVE GATE: Bypasses all geolocation checks if employee has active leave
  leaveActive: {
    isOnLeave: true,
    profile: {
      work_setup: 'on_site', // Even on-site, leave takes precedence
      work_radius_m: 500,
      work_lat: 14.5995,
      work_lng: 120.9842,
    },
    currentLocation: { lat: 10.3157, lng: 123.8854 }, // Far away
    expectedState: 'blocked' // Specific component UI 'locked' state (isOnLeave === true)
  },

  // 2. THE REMOTE BYPASS: No geofence required for remote workers
  remoteWorker: {
    isOnLeave: false,
    profile: {
      work_setup: 'remote',
      work_radius_m: 0,
      work_lat: 0,
      work_lng: 0,
    },
    currentLocation: { lat: 14.5547, lng: 121.0244 },
    expectedState: 'secured' // Always secured regardless of location
  },

  // 3. STANDARD BOUNDARY: VIOLATION (Outside Radius)
  onSiteViolation: {
    isOnLeave: false,
    profile: {
      work_setup: 'on_site',
      work_radius_m: 100,
      work_lat: 14.5547,
      work_lng: 121.0244,
    },
    currentLocation: { lat: 14.5600, lng: 121.0300 }, // ~800m away
    expectedState: 'violation' // Should reveal OutsideZoneMap
  },

  // 4. STANDARD BOUNDARY: COMPLIANT (Inside Radius)
  onSiteCompliant: {
    isOnLeave: false,
    profile: {
      work_setup: 'on_site',
      work_radius_m: 200,
      work_lat: 14.5547,
      work_lng: 121.0244,
    },
    currentLocation: { lat: 14.5550, lng: 121.0250 }, // ~50m away
    expectedState: 'secured' // Clock-in button enabled
  }
};
