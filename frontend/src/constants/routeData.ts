// A list of coordinates representing the "Duan-Mao" optimized path
export const AMBULANCE_ROUTE = [
  { lat: 43.856, lng: -79.330, isPivot: true }, // Starting Point (MVA)
  { lat: 43.858, lng: -79.350, isPivot: false },
  { lat: 43.862, lng: -79.380, isPivot: true },  // Pivot Node
  { lat: 43.865, lng: -79.410, isPivot: false },
  { lat: 43.870, lng: -79.440, isPivot: true }  // Mackenzie Health (Goal)
];