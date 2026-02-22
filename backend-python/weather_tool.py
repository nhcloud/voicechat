"""
Weather Tool for Azure OpenAI Realtime API
Returns hardcoded weather data for demo purposes
"""

import json
from typing import Dict, Any

# Tool definition to register with Azure OpenAI
WEATHER_TOOL_DEFINITION = {
    "type": "function",
    "name": "get_weather",
    "description": "Get the current weather for a specified city. Call this whenever the user asks about weather conditions in a specific location.",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "The city name to get weather for (e.g., 'Seattle', 'New York', 'London')"
            },
            "unit": {
                "type": "string",
                "description": "Temperature unit: 'celsius' or 'fahrenheit'",
                "enum": ["celsius", "fahrenheit"]
            }
        },
        "required": ["city"]
    }
}

# Hardcoded weather data for demo
WEATHER_DATA: Dict[str, tuple] = {
    "seattle": (8, "Rainy", 85, 15),
    "new york": (12, "Partly Cloudy", 60, 20),
    "los angeles": (22, "Sunny", 40, 10),
    "london": (10, "Overcast", 75, 18),
    "paris": (14, "Cloudy", 65, 12),
    "tokyo": (16, "Clear", 55, 8),
    "sydney": (25, "Sunny", 50, 14),
    "dubai": (32, "Hot and Sunny", 30, 5),
    "mumbai": (28, "Humid", 80, 10),
    "toronto": (5, "Snowy", 70, 25),
    "san francisco": (15, "Foggy", 72, 16),
    "chicago": (7, "Windy", 55, 35),
    "miami": (27, "Sunny", 75, 12),
    "denver": (10, "Clear", 35, 8),
    "boston": (9, "Cloudy", 62, 18),
}


def celsius_to_fahrenheit(celsius: int) -> int:
    """Convert Celsius to Fahrenheit"""
    return (celsius * 9 // 5) + 32


def get_weather(arguments_json: str) -> str:
    """
    Execute the weather tool with given arguments
    
    Args:
        arguments_json: JSON string with city and optional unit
        
    Returns:
        JSON string with weather data
    """
    try:
        args = json.loads(arguments_json)
        city = args.get("city", "Unknown")
        unit = args.get("unit", "celsius")
        
        weather = get_weather_for_city(city, unit)
        return json.dumps(weather)
    except Exception as e:
        return json.dumps({"error": f"Failed to get weather: {str(e)}"})


def get_weather_for_city(city: str, unit: str = "celsius") -> Dict[str, Any]:
    """
    Get weather data for a specific city
    
    Args:
        city: City name
        unit: Temperature unit ('celsius' or 'fahrenheit')
        
    Returns:
        Dictionary with weather data
    """
    city_lower = city.lower()
    
    if city_lower in WEATHER_DATA:
        temp_c, condition, humidity, wind_kph = WEATHER_DATA[city_lower]
        temp = celsius_to_fahrenheit(temp_c) if unit == "fahrenheit" else temp_c
        unit_symbol = "°F" if unit == "fahrenheit" else "°C"
        
        return {
            "city": city,
            "temperature": temp,
            "unit": unit_symbol,
            "condition": condition,
            "humidity": f"{humidity}%",
            "wind": f"{wind_kph} km/h",
            "description": f"The weather in {city} is {condition.lower()} with a temperature of {temp}{unit_symbol}. Humidity is at {humidity}% with winds of {wind_kph} km/h."
        }
    
    # Default weather for unknown cities
    default_temp = 68 if unit == "fahrenheit" else 20
    default_unit = "°F" if unit == "fahrenheit" else "°C"
    
    return {
        "city": city,
        "temperature": default_temp,
        "unit": default_unit,
        "condition": "Moderate",
        "humidity": "50%",
        "wind": "10 km/h",
        "description": f"Weather data for {city}: Temperature is {default_temp}{default_unit} with moderate conditions."
    }


# Available tools registry
AVAILABLE_TOOLS = {
    "get_weather": get_weather
}


def execute_tool(name: str, arguments: str) -> str:
    """
    Execute a tool by name
    
    Args:
        name: Tool function name
        arguments: JSON string with tool arguments
        
    Returns:
        JSON string with tool result
    """
    if name in AVAILABLE_TOOLS:
        return AVAILABLE_TOOLS[name](arguments)
    else:
        return json.dumps({"error": f"Unknown function: {name}"})
