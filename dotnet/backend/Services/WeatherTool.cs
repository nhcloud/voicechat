using System.Text.Json;

namespace VoiceChat.Backend.Services;

/// <summary>
/// Simple weather tool for demonstrating function calling with Azure OpenAI Realtime API
/// Returns hardcoded weather data for demo purposes
/// </summary>
public static class WeatherTool
{
    /// <summary>
    /// Tool definition to register with Azure OpenAI
    /// </summary>
    public static object GetToolDefinition() => new
    {
        type = "function",
        name = "get_weather",
        description = "Get the current weather for a specified city. Call this whenever the user asks about weather conditions in a specific location.",
        parameters = new
        {
            type = "object",
            properties = new
            {
                city = new
                {
                    type = "string",
                    description = "The city name to get weather for (e.g., 'Seattle', 'New York', 'London')"
                },
                unit = new
                {
                    type = "string",
                    description = "Temperature unit: 'celsius' or 'fahrenheit'",
                    @enum = new[] { "celsius", "fahrenheit" }
                }
            },
            required = new[] { "city" }
        }
    };

    /// <summary>
    /// Execute the weather tool with given arguments
    /// </summary>
    public static string Execute(string argumentsJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(argumentsJson);
            var root = doc.RootElement;
            
            var city = root.TryGetProperty("city", out var cityElement) 
                ? cityElement.GetString() ?? "Unknown" 
                : "Unknown";
            
            var unit = root.TryGetProperty("unit", out var unitElement) 
                ? unitElement.GetString() ?? "celsius" 
                : "celsius";

            var weather = GetWeatherForCity(city, unit);
            return JsonSerializer.Serialize(weather);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { error = $"Failed to get weather: {ex.Message}" });
        }
    }

    private static object GetWeatherForCity(string city, string unit)
    {
        // Hardcoded weather data for demo
        var weatherData = new Dictionary<string, (int tempC, string condition, int humidity, int windKph)>(StringComparer.OrdinalIgnoreCase)
        {
            ["Seattle"] = (8, "Rainy", 85, 15),
            ["New York"] = (12, "Partly Cloudy", 60, 20),
            ["Los Angeles"] = (22, "Sunny", 40, 10),
            ["London"] = (10, "Overcast", 75, 18),
            ["Paris"] = (14, "Cloudy", 65, 12),
            ["Tokyo"] = (16, "Clear", 55, 8),
            ["Sydney"] = (25, "Sunny", 50, 14),
            ["Dubai"] = (32, "Hot and Sunny", 30, 5),
            ["Mumbai"] = (28, "Humid", 80, 10),
            ["Toronto"] = (5, "Snowy", 70, 25),
            ["San Francisco"] = (15, "Foggy", 72, 16),
            ["Chicago"] = (7, "Windy", 55, 35),
            ["Miami"] = (27, "Sunny", 75, 12),
            ["Denver"] = (10, "Clear", 35, 8),
            ["Boston"] = (9, "Cloudy", 62, 18),
        };

        if (weatherData.TryGetValue(city, out var data))
        {
            var temp = unit == "fahrenheit" ? CelsiusToFahrenheit(data.tempC) : data.tempC;
            var unitSymbol = unit == "fahrenheit" ? "°F" : "°C";
            
            return new
            {
                city = city,
                temperature = temp,
                unit = unitSymbol,
                condition = data.condition,
                humidity = $"{data.humidity}%",
                wind = $"{data.windKph} km/h",
                description = $"The weather in {city} is {data.condition.ToLower()} with a temperature of {temp}{unitSymbol}. Humidity is at {data.humidity}% with winds of {data.windKph} km/h."
            };
        }
        
        // Default weather for unknown cities
        var defaultTemp = unit == "fahrenheit" ? 68 : 20;
        var defaultUnit = unit == "fahrenheit" ? "°F" : "°C";
        
        return new
        {
            city = city,
            temperature = defaultTemp,
            unit = defaultUnit,
            condition = "Moderate",
            humidity = "50%",
            wind = "10 km/h",
            description = $"Weather data for {city}: Temperature is {defaultTemp}{defaultUnit} with moderate conditions."
        };
    }

    private static int CelsiusToFahrenheit(int celsius) => (celsius * 9 / 5) + 32;
}
