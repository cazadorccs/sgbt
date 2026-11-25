import asyncio
from google.antigravity import Agent, LocalOpenAIAgentConfig

async def main():
    # Para Ollama usa: base_url="http://localhost:11434/v1"
    # Para LM Studio usa: base_url="http://localhost:1234/v1"
    config = LocalOpenAIAgentConfig(
        model="gemma4:26b",  # Reemplaza con el nombre exacto de tu modelo cargado
        base_url="http://localhost:11434/v1",
    ).lightweight()

    async with Agent(config) as agent:
        response = await agent.chat("¿Qué archivos hay en este directorio?")
        async for token in response:
            print(token, end="", flush=True)
        print()

if __name__ == "__main__":
    asyncio.run(main())
