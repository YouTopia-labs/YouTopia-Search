/**
 * Fetches and processes weather, AQI, and forecast data for a given location.
 * @param {string} location - The name of the location to search for (e.g., "New York", "Tokyo").
 * @returns {Promise<object>} A promise that resolves with a structured JSON object containing all the weather data,
 * or rejects with an error object if the location is not found or an API error occurs.
 */
async function fetchWheatData(location) {
    if (!location || typeof location !== 'string' || location.trim() === '') {
        return Promise.reject({ error: true, message: "Invalid location provided." });
    }

    // 1. Geocode location to get coordinates and timezone
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();

    if (!geoData.results || geoData.results.length === 0) {
        return Promise.reject({ error: true, message: `Could not find location: "${location}"` });
    }

    const { latitude, longitude, name, country, timezone } = geoData.results[0];

    // 2. Fetch all weather and forecast data in a single API call
    const hourlyParams = "temperature_2m,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility";
    const currentParams = "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m";
    const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=${currentParams}&hourly=${hourlyParams}&daily=weather_code,temperature_2m_max,temperature_2m_min&current_air_quality=true&timezone=${timezone}&forecast_days=8`;

    const weatherResponse = await fetch(weatherApiUrl);
    const weatherData = await weatherResponse.json();

    // 3. Handle cases where weather data is unavailable and fall back to time-only
    if (weatherData.error || !weatherData.current || !weatherData.daily || !weatherData.hourly) {
        const now = new Date();
        return {
            request_info: {
                location: name,
                country: country,
                latitude: latitude,
                longitude: longitude,
                timezone: timezone,
                retrieved_at: now.toISOString(),
                status: "Weather data unavailable, showing time only."
            },
            local_time: {
                time: now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: true }),
                date: now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            },
            current_conditions: null,
            air_quality_index: null,
            daily_forecast_7_days: null,
            hourly_forecast_24_hours: null,
        };
    }

    // 4. If successful, structure the full JSON response
    return structureJsonResponse(weatherData, name, country, timezone);
}

/**
 * Helper function to structure the raw API data into a clean JSON object.
 * @private
 */
function structureJsonResponse(data, name, country, timezone) {
    const now = new Date();

    // Structure current data
    const current = {
        time: data.current.time,
        temperature: data.current.temperature_2m,
        apparent_temperature: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        wind_speed: data.current.wind_speed_10m,
        weather: getWeatherInfo(data.current.weather_code),
        units: {
            temperature: data.current_units.temperature_2m,
            humidity: data.current_units.relative_humidity_2m,
            wind_speed: data.current_units.wind_speed_10m
        }
    };

    // Structure AQI intelligently
    let aqi = null;
    if (data.current_air_quality) {
        if (data.current_air_quality.us_aqi !== null && data.current_air_quality.us_aqi !== undefined) {
            aqi = {
                standard: "US AQI",
                index: data.current_air_quality.us_aqi,
                level: getAqiInfo(data.current_air_quality.us_aqi, 'US').level
            };
        } else if (data.current_air_quality.european_aqi !== null && data.current_air_quality.european_aqi !== undefined) {
             aqi = {
                standard: "European AQI",
                index: data.current_air_quality.european_aqi,
                level: getAqiInfo(data.current_air_quality.european_aqi, 'EU').level
            };
        }
    }

    // Structure daily forecast
    const dailyForecast = data.daily.time.slice(0, 7).map((time, i) => ({
        date: time,
        weather: getWeatherInfo(data.daily.weather_code[i]),
        temperature_max: data.daily.temperature_2m_max[i],
        temperature_min: data.daily.temperature_2m_min[i],
        units: {
            temperature: data.daily_units.temperature_2m_max
        }
    }));

    // Structure hourly forecast for the next 24 hours
    let startIndex = data.hourly.time.findIndex(t => new Date(t) >= now);
    if (startIndex === -1) startIndex = 0;

    const hourlyForecast = data.hourly.time.slice(startIndex, startIndex + 24).map((time, i) => {
        const originalIndex = startIndex + i;
        return {
            time: time,
            temperature: data.hourly.temperature_2m[originalIndex],
            weather: getWeatherInfo(data.hourly.weather_code[originalIndex]),
            precipitation: {
                probability: data.hourly.precipitation_probability[originalIndex],
                total: data.hourly.precipitation[originalIndex],
                rain: data.hourly.rain[originalIndex],
                showers: data.hourly.showers[originalIndex],
                snowfall: data.hourly.snowfall[originalIndex],
                units: {
                    probability: data.hourly_units.precipitation_probability,
                    amount: data.hourly_units.precipitation
                }
            },
            cloud_cover: {
                total: data.hourly.cloud_cover[originalIndex],
                low: data.hourly.cloud_cover_low[originalIndex],
                mid: data.hourly.cloud_cover_mid[originalIndex],
                high: data.hourly.cloud_cover_high[originalIndex],
                unit: data.hourly_units.cloud_cover
            },
            visibility: {
                value: data.hourly.visibility[originalIndex],
                unit: data.hourly_units.visibility
            }
        };
    });

    // Combine into final object
    return {
        request_info: {
            location: name,
            country: country,
            latitude: data.latitude,
            longitude: data.longitude,
            timezone: timezone,
            retrieved_at: now.toISOString()
        },
        current_conditions: current,
        air_quality_index: aqi,
        daily_forecast_7_days: dailyForecast,
        hourly_forecast_24_hours: hourlyForecast,
    };
}

/**
 * Helper function to decode weather codes into human-readable descriptions and icons.
 * @private
 */
function getWeatherInfo(code) {
    const weatherMap = {
        0: { description: 'Clear sky', icon: '☀️' }, 1: { description: 'Mainly clear', icon: '🌤️' }, 2: { description: 'Partly cloudy', icon: '⛅️' }, 3: { description: 'Overcast', icon: '☁️' }, 45: { description: 'Fog', icon: '🌫️' }, 48: { description: 'Rime fog', icon: '🌫️' }, 51: { description: 'Light drizzle', icon: '💧' }, 53: { description: 'Drizzle', icon: '💧' }, 55: { description: 'Dense drizzle', icon: '💧' }, 56: { description: 'Light freeze drizzle', icon: '🥶' }, 57: { description: 'Dense freeze drizzle', icon: '🥶' }, 61: { description: 'Slight rain', icon: '🌧️' }, 63: { description: 'Rain', icon: '🌧️' }, 65: { description: 'Heavy rain', icon: '🌧️' }, 66: { description: 'Light freeze rain', icon: '🥶' }, 67: { description: 'Heavy freeze rain', icon: '🥶' }, 71: { description: 'Slight snow', icon: '❄️' }, 73: { description: 'Snow', icon: '❄️' }, 75: { description: 'Heavy snow', icon: '❄️' }, 77: { description: 'Snow grains', icon: '❄️' }, 80: { description: 'Slight showers', icon: '🌦️' }, 81: { description: 'Showers', icon: '🌦️' }, 82: { description: 'Violent showers', icon: '🌦️' }, 85: { description: 'Slight snow showers', icon: '🌨️' }, 86: { description: 'Heavy snow showers', icon: '🌨️' }, 95: { description: 'Thunderstorm', icon: '⛈️' }, 96: { description: 'Slight hail', icon: '⛈️' }, 99: { description: 'Heavy hail', icon: '⛈️' },
    };
    return weatherMap[code] || { description: 'Unknown', icon: '🤷' };
}

/**
 * Helper function to decode AQI values into human-readable levels.
 * @private
 */
function getAqiInfo(aqi, standard = 'EU') {
    if (standard === 'US') {
        if (aqi <= 50) return { level: 'Good' };
        if (aqi <= 100) return { level: 'Moderate' };
        if (aqi <= 150) return { level: 'Unhealthy for Sensitive Groups' };
        if (aqi <= 200) return { level: 'Unhealthy' };
        if (aqi <= 300) return { level: 'Very Unhealthy' };
        return { level: 'Hazardous' };
    }
    // Default to European Standard
    if (aqi <= 20) return { level: 'Good' };
    if (aqi <= 40) return { level: 'Fair' };
    if (aqi <= 60) return { level: 'Moderate' };
    if (aqi <= 80) return { level: 'Poor' };
    if (aqi <= 100) return { level: 'Very Poor' };
    return { level: 'Extremely Poor' };
}

// Export the function for use in other modules
export { fetchWheatData };