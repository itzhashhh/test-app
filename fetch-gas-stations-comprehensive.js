#!/usr/bin/env node

/**
 * Comprehensive fetch of ALL gas stations in Sri Lanka using Google Places API
 * Uses a dense grid search pattern with small radii for maximum coverage
 *
 * Usage: GOOGLE_API_KEY=your_api_key node fetch-gas-stations-comprehensive.js
 */

const fs = require('fs');

const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.error('Error: GOOGLE_API_KEY environment variable is required');
  process.exit(1);
}

// Sri Lanka approximate bounds
const BOUNDS = {
  north: 9.85,
  south: 5.90,
  east: 81.90,
  west: 79.50
};

// Search radius in meters (5km for denser coverage)
const SEARCH_RADIUS = 5000;

// Generate a grid of search points across Sri Lanka.
// Grid spacing scales with radius so smaller radii keep full coverage.
function generateSearchGrid() {
  const points = [];

  const radiusKm = SEARCH_RADIUS / 1000;
  const gridStepKm = radiusKm * 1.35; // < r*sqrt(2), keeps overlap and avoids coverage gaps
  const avgLat = (BOUNDS.north + BOUNDS.south) / 2;
  const latKmPerDegree = 111;
  const lngKmPerDegree = 111 * Math.cos((avgLat * Math.PI) / 180);

  const latStep = gridStepKm / latKmPerDegree;
  const lngStep = gridStepKm / lngKmPerDegree;

  for (let lat = BOUNDS.south; lat <= BOUNDS.north; lat += latStep) {
    for (let lng = BOUNDS.west; lng <= BOUNDS.east; lng += lngStep) {
      // Only include points that are roughly within Sri Lanka's land mass
      if (isWithinSriLanka(lat, lng)) {
        points.push({ lat, lng });
      }
    }
  }

  return points;
}

// Rough check if point is within Sri Lanka land mass
function isWithinSriLanka(lat, lng) {
  // Northern region (Jaffna peninsula)
  if (lat > 9.4) {
    return lng >= 79.8 && lng <= 80.5;
  }
  // Upper north
  if (lat > 8.8) {
    return lng >= 79.7 && lng <= 81.0;
  }
  // North-central
  if (lat > 8.0) {
    return lng >= 79.7 && lng <= 81.3;
  }
  // Central
  if (lat > 7.0) {
    return lng >= 79.6 && lng <= 81.9;
  }
  // South-central
  if (lat > 6.3) {
    return lng >= 79.8 && lng <= 81.9;
  }
  // Southern tip
  return lng >= 79.8 && lng <= 81.3;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function searchNearby(lat, lng, pageToken = null, retries = 3) {
  const baseUrl = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

  const params = new URLSearchParams({
    key: API_KEY,
    location: `${lat},${lng}`,
    radius: SEARCH_RADIUS.toString(),
    type: 'gas_station',
  });

  if (pageToken) {
    params.set('pagetoken', pageToken);
  }

  const url = `${baseUrl}?${params.toString()}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'REQUEST_DENIED') {
      throw new Error(`API Error: ${data.error_message || 'Request denied'}`);
    }

    if (data.status === 'INVALID_REQUEST' && pageToken && retries > 0) {
      // Page token might not be ready yet
      await delay(2000);
      return searchNearby(lat, lng, pageToken, retries - 1);
    }

    return data;
  } catch (error) {
    if (retries > 0) {
      await delay(1000);
      return searchNearby(lat, lng, pageToken, retries - 1);
    }
    throw error;
  }
}

async function fetchAllPagesForLocation(lat, lng) {
  const stations = [];
  let pageToken = null;
  let pageCount = 0;
  const maxPages = 3;

  do {
    try {
      const data = await searchNearby(lat, lng, pageToken);

      if (data.results && data.results.length > 0) {
        stations.push(...data.results);
      }

      pageToken = data.next_page_token;
      pageCount++;

      if (pageToken && pageCount < maxPages) {
        await delay(2000); // Required delay for next_page_token
      }
    } catch (error) {
      console.error(`    Error at ${lat.toFixed(3)},${lng.toFixed(3)}: ${error.message}`);
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
    address: station.vicinity || station.formatted_address || '',
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
  console.log('='.repeat(60));
  console.log('Comprehensive Gas Station Fetch for Sri Lanka');
  console.log('='.repeat(60));

  const gridPoints = generateSearchGrid();
  console.log(`\nGenerated ${gridPoints.length} search grid points`);
  console.log(`Search radius: ${SEARCH_RADIUS / 1000}km per point\n`);

  let allStations = [];
  let completedPoints = 0;
  let totalFound = 0;

  const startTime = Date.now();

  for (const point of gridPoints) {
    const stations = await fetchAllPagesForLocation(point.lat, point.lng);

    if (stations.length > 0) {
      allStations.push(...stations);
      totalFound += stations.length;
    }

    completedPoints++;

    // Progress update every 10 points
    if (completedPoints % 10 === 0 || completedPoints === gridPoints.length) {
      const uniqueCount = new Set(allStations.map(s => s.place_id)).size;
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`Progress: ${completedPoints}/${gridPoints.length} points | Raw: ${totalFound} | Unique: ${uniqueCount} | Time: ${elapsed}min`);
    }

    // Small delay between requests to avoid rate limiting
    await delay(200);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Processing results...');
  console.log('='.repeat(60));

  console.log(`\nTotal raw results: ${allStations.length}`);

  // Remove duplicates
  const uniqueStations = deduplicateStations(allStations);
  console.log(`Unique gas stations: ${uniqueStations.length}`);

  // Format the data
  const formattedStations = formatStationData(uniqueStations);

  // Sort by name
  formattedStations.sort((a, b) => a.name.localeCompare(b.name));

  // Create output
  const output = {
    metadata: {
      country: 'Sri Lanka',
      total_stations: formattedStations.length,
      fetched_at: new Date().toISOString(),
      source: 'Google Places API',
      search_method: 'Comprehensive grid search',
      grid_points_searched: gridPoints.length,
      search_radius_km: SEARCH_RADIUS / 1000
    },
    gas_stations: formattedStations
  };

  // Write to file
  const outputPath = './gas-stations-sri-lanka.json';
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total unique gas stations found: ${formattedStations.length}`);
  console.log(`Data saved to: ${outputPath}`);
  console.log(`Total time: ${elapsed} minutes`);
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
