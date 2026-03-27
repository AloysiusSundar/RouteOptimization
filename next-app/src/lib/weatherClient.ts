'use server';

export interface WeatherData {
    temp: number;
    description: string;
    iconCode: string;
    location: string;
}

export async function getWeatherData(lat: number, lon: number): Promise<WeatherData | null> {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
        console.error('OPENWEATHER_API_KEY missing in environment variables');
        return null;
    }

    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
        );
        if (!response.ok) {
            console.error(`Weather API error: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        return {
            temp: Math.round(data.main.temp),
            description: data.weather[0].description,
            iconCode: data.weather[0].icon.substring(0, 2),
            location: data.name
        };
    } catch (error) {
        console.error('Error fetching weather:', error);
        return null;
    }
}
