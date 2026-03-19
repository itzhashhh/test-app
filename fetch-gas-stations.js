#!/usr/bin/env node

/**
 * Fetches all gas stations in Sri Lanka using Google Places API
 *
 * Usage:
 *   GOOGLE_API_KEY=your_api_key node fetch-gas-stations.js
 *
 * Or set the API key in a .env file:
 *   GOOGLE_API_KEY=your_api_key
 */

const fs = require('fs');

const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.error('Error: GOOGLE_API_KEY environment variable is required');
  console.error('Usage: GOOGLE_API_KEY=your_api_key node fetch-gas-stations.js');
  process.exit(1);
}

// Sri Lanka bounding box (approximate)
// North: 9.8°N, South: 5.9°N, East: 81.9°E, West: 79.5°E
const SRI_LANKA_BOUNDS = {
  north: 9.8,
  south: 5.9,
  east: 81.9,
  west: 79.5
};

// Major cities/regions in Sri Lanka to search from (for better coverage)
const SEARCH_LOCATIONS = [
  { name: 'Colombo', lat: 6.9271, lng: 79.8612 },
  { name: 'Kandy', lat: 7.2906, lng: 80.6337 },
  { name: 'Galle', lat: 6.0535, lng: 80.2210 },
  { name: 'Jaffna', lat: 9.6615, lng: 80.0255 },
  { name: 'Negombo', lat: 7.2008, lng: 79.8737 },
  { name: 'Batticaloa', lat: 7.7310, lng: 81.6747 },
  { name: 'Trincomalee', lat: 8.5874, lng: 81.2152 },
  { name: 'Anuradhapura', lat: 8.3114, lng: 80.4037 },
  { name: 'Matara', lat: 5.9485, lng: 80.5353 },
  { name: 'Kurunegala', lat: 7.4863, lng: 80.3647 },
  { name: 'Ratnapura', lat: 6.7056, lng: 80.3847 },
  { name: 'Badulla', lat: 6.9934, lng: 81.0550 },
  { name: 'Nuwara Eliya', lat: 6.9497, lng: 80.7891 },
  { name: 'Hambantota', lat: 6.1241, lng: 81.1185 },
  { name: 'Ampara', lat: 7.2976, lng: 81.6820 },
  { name: 'Polonnaruwa', lat: 7.9403, lng: 81.0188 },
  { name: 'Kalmunai', lat: 7.4090, lng: 81.8321 },
  { name: 'Vavuniya', lat: 8.7542, lng: 80.4982 },
  { name: 'Puttalam', lat: 8.0362, lng: 79.8283 },
  { name: 'Mannar', lat: 8.9810, lng: 79.9044 },
  { name: 'Chilaw', lat: 7.5758, lng: 79.7953 },
  { name: 'Kalutara', lat: 6.5854, lng: 79.9607 },
  { name: 'Gampaha', lat: 7.0917, lng: 79.9994 },
  { name: 'Dambulla', lat: 7.8675, lng: 80.6517 },
  { name: 'Kilinochchi', lat: 9.3803, lng: 80.3770 },
  { name: 'Mullaitivu', lat: 9.2671, lng: 80.8142 },
  { name: 'Kegalle', lat: 7.2513, lng: 80.3464 },
  { name: 'Monaragala', lat: 6.8728, lng: 81.3507 },
  { name: 'Embilipitiya', lat: 6.3394, lng: 80.8494 },
  { name: 'Matale', lat: 7.4675, lng: 80.6234 },
];

// Search radius in meters (50km to cover surrounding areas)
const SEARCH_RADIUS = 50000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function searchNearby(location, pageToken = null) {
  const baseUrl = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

  const params = new URLSearchParams({
    key: API_KEY,
    location: `${location.lat},${location.lng}`,
    radius: SEARCH_RADIUS.toString(),
    type: 'gas_station',
  });

  if (pageToken) {
    params.set('pagetoken', pageToken);
  }

  const url = `${baseUrl}?${params.toString()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'REQUEST_DENIED') {
    throw new Error(`API Error: ${data.error_message || 'Request denied'}`);
  }

  if (data.status === 'INVALID_REQUEST' && pageToken) {
    // Page token might not be ready yet, wait and retry
    await delay(2000);
    return searchNearby(location, pageToken);
  }

  return data;
}

async function fetchGasStationsForLocation(location) {
  const stations = [];
  let pageToken = null;
  let pageCount = 0;
  const maxPages = 3; // Google Places API returns max 60 results (3 pages of 20)

  console.log(`  Searching near ${location.name}...`);

  do {
    try {
      const data = await searchNearby(location, pageToken);

      if (data.results) {
        stations.push(...data.results);
        console.log(`    Found ${data.results.length} stations (page ${pageCount + 1})`);
      }

      pageToken = data.next_page_token;
      pageCount++;

      // Wait before fetching next page (required by Google API)
      if (pageToken && pageCount < maxPages) {
        await delay(2000);
      }
    } catch (error) {
      console.error(`    Error: ${error.message}`);
      break;
    }
  } while (pageToken && pageCount < maxPages);

  return stations;
}

function deduplicateStations(stations) {
  const seen = new Map();

  for (const station of stations) {
    if (!seen.has(station.place_id)) {
      seen.set(station.place_id, station);
    }
  }

  return Array.from(seen.values());
}

function formatStationData(stations) {
  return stations.map(station => ({
    place_id: station.place_id,
    name: station.name,
    address: station.vicinity || station.formatted_address,
    location: {
      lat: station.geometry.location.lat,
      lng: station.geometry.location.lng
    },
    rating: station.rating || null,
    user_ratings_total: station.user_ratings_total || 0,
    business_status: station.business_status || 'UNKNOWN',
    types: station.types || [],
    opening_hours: station.opening_hours ? {
      open_now: station.opening_hours.open_now
    } : null
  }));
}

async function main() {
  console.log('Fetching gas stations in Sri Lanka...\n');

  let allStations = [];

  for (const location of SEARCH_LOCATIONS) {
    const stations = await fetchGasStationsForLocation(location);
    allStations.push(...stations);

    // Rate limiting - wait between location searches
    await delay(500);
  }

  console.log(`\nTotal results before deduplication: ${allStations.length}`);

  // Remove duplicates
  const uniqueStations = deduplicateStations(allStations);
  console.log(`Unique gas stations found: ${uniqueStations.length}`);

  // Format the data
  const formattedStations = formatStationData(uniqueStations);

  // Sort by name
  formattedStations.sort((a, b) => a.name.localeCompare(b.name));

  // Create output object
  const output = {
    metadata: {
      country: 'Sri Lanka',
      total_stations: formattedStations.length,
      fetched_at: new Date().toISOString(),
      source: 'Google Places API'
    },
    gas_stations: formattedStations
  };

  // Write to file
  const outputPath = './gas-stations-sri-lanka.json';
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\nData saved to ${outputPath}`);
  console.log('\nSample entries:');
  console.log(JSON.stringify(formattedStations.slice(0, 3), null, 2));
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
