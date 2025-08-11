// --- Constants ---
const WORKER_BASE_URL = 'https://youtopia-worker.youtopialabs.workers.dev/';

// This function now handles the server-sent events (SSE) stream from the worker.
export async function orchestrateAgents(query, userName, userLocalTime, selectedModel, streamCallback, logCallback, isShortResponseEnabled) {
    const userEmail = localStorage.getItem('user_email') || 'bypass@youtopia.ai';

    const response = await fetch(`${WORKER_BASE_URL}api/orchestrate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
            userName,
            userEmail,
            userLocalTime,
            selectedModel,
            isShortResponseEnabled,
            is_preview: true // Flag to tell the worker to use the bypass
        }),
    });

    if (!response.body) {
        throw new Error("Response body is null");
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let finalResponse, sources;

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }

        // Process server-sent events
        const lines = value.split('\n\n');
        for (const line of lines) {
            if (line.startsWith('data:')) {
                try {
                    const data = JSON.parse(line.substring(5));
                    switch (data.type) {
                        case 'stream':
                            streamCallback(data.content);
                            break;
                        case 'log':
                            logCallback(data.content);
                            break;
                        case 'final_response':
                            finalResponse = data.content;
                            sources = data.sources;
                            break;
                        case 'error':
                            throw new Error(data.content);
                    }
                } catch (e) {
                    console.error("Error parsing SSE data:", e, "Line:", line);
                }
            }
        }
    }

    return { finalResponse, sources };
}