import agent1SystemPrompt from './agent1_prompt.js';
import agent3SystemPrompt from './agent3_prompt.js';

export function selectAgents(selection) {
  let agentConfig = {};

  const lowerCaseSelection = selection.toLowerCase();

  if (lowerCaseSelection === 'amaya') {
    agentConfig = {
      agent1: {
        model: 'mistral-medium-latest',
        prompt: agent1SystemPrompt
      },
      agent3: {
        model: 'mistral-small-latest',
        prompt: agent3SystemPrompt
      }
    };
  } else if (lowerCaseSelection === 'amaya lite') {
    agentConfig = {
      agent1: {
        model: 'mistral-small-latest',
        prompt: agent1SystemPrompt
      },
      agent3: {
        model: 'mistral-tiny-latest',
        prompt: agent3SystemPrompt
      }
    };
  } else {
    throw new Error('Invalid selection for agent configuration.');
  }

  return agentConfig;
}