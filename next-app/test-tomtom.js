const TOMTOM_API_KEY = '';

async function testTraffic(origin, destination) {
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${origin}/${destination}/json?key=${TOMTOM_API_KEY}&traffic=true&travelMode=car&departAt=now`;
    console.log(`Testing URL: ${url}`);
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data.routes || data.routes.length === 0) {
            console.log('No routes found:', data);
            return;
        }
        const route = data.routes[0].summary;
        console.log('--- Results ---');
        console.log(`Live Traffic Time: ${(route.travelTimeInSeconds / 60).toFixed(2)} mins`);
        console.log(`Historical Traffic Time: ${(route.historicTrafficTravelTimeInSeconds / 60).toFixed(2)} mins`);
        console.log(`No Traffic Time: ${(route.noTrafficTravelTimeInSeconds / 60).toFixed(2)} mins`);
        console.log(`Traffic Delay: ${(route.trafficDelayInSeconds / 60).toFixed(2)} mins`);
    } catch (error) {
        console.error('Error fetching TomTom data:', error.message);
    }
}

// Test a route in Jakarta (usually busy)
// Monas to Sudirman
testTraffic('-6.1754,106.8272', '-6.2286,106.8272');
