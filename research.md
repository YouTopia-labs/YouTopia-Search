
**Authors:** Ayush Roy
**Affiliation:** Independent Research
**Email:** ayushhroyy@gmail.com

## Abstract
Popular AI search engines like [**Komo**](https://komo.ai/ "null") and [**Perplexity**](https://www.perplexity.ai/ "null") demonstrate the application of AI in Web surfing. While these systems vary in underlying architecture, some may rely on a single monolithic LLM to handle most tasks. **YouTopia Search** offers an alternative approach, a **multi-agent architecture** with a **mixture of models**. Our system employs **three specialized AI agents**, each optimized for a specific part of the search workflow:
- **Agent 1** analyzes the user query and generates a search plan with tool calls.

- **Agent 2**  assesses the results of those tool calls to determine if the information is sufficient, and makes strategic decisions about web scraping and conditionally triggers "Deep thinking search"

- **Agent 3** formats the curated data and synthesizes a clear and structured answer using markdown, `Chart.js` and `Grid.js`.

The most interesting part of this architecture is what we call **"Deep Thinking Search."** It activates conditionally when Agent 2 realizes it could find better information by making new searches with the smarter terms that it gained from web search results. It can then perform a recursive step, or in simpler terms, reverse the flow of the search with this new knowledge. This approach provides a self-correcting mechanism that continuously steers the workflow in the right direction. Our tests show that this approach often provides better answers than current AI search systems on complex queries without going into a deep search paradigm.

**Keywords:** AI search, multi-agent systems, smart search, LLM, information retrieval, answer generation, mixture of models

## 1. Introduction

Leading AI search engines like [**Perplexity**](https://www.perplexity.ai/ "null") and [**Komo**](https://komo.ai/ "null") have transformed how we find information online. Instead of getting a list of websites to manually click on and read, AI can now read those web pages for us and give direct answers. This became a major feat for traditional web surfing and the application of AI.
However, there's a fundamental issue with how current AI search systems work. Most of them use one large language model to handle everything from query understanding, tool calling, information parsing, content scraping decisions, and answer synthesis. This single model has to be a generalist across all these different tasks, which leads to inefficiencies. It also has to work with an already filled context window, which slows down output token generation and response quality, and is also known to introduce hallucinations.
This monolithic approach has several problems:

- **Computational Waste:** The same powerful model handles simple tasks like query parsing that could be done more efficiently by smaller, specialized models.

- **Linear Processing:** These systems typically process the user's original query linearly without adaptive refinement. They don't leverage insights gained from initial results to improve subsequent searches.

- **Risk of Hallucinations:** By having one model handle both information gathering and answer synthesis, there's a higher risk of the model filling gaps with generated content rather than acknowledging information limitations.

We designed a fundamentally different architecture. Instead of one large AI handling everything, we created **three specialized AI agents** using a mixture of models approach. Each agent is optimized for its specific function: query deconstruction and tool calling, information assessment and scraping decisions, and answer formatting and presentation. This specialization allows each component to excel at its particular task while working together seamlessly.
The key innovation is our **"Deep Thinking Search"** mechanism — a self-correcting system where insights gained from initial tool call results inform smarter follow-up searches. When the system identifies better search terms from the results, it can perform recursive steps that reverse the workflow for 1-2 iterations with this new knowledge. This creates a feedback loop that continuously improves search precision and answer quality by steering the workflow in the right direction to prevent endless cycles, agent 2 is permitted to perform this step only twice per search.
Our contributions are: a multi-agent architecture that outperforms monolithic approaches, a self-correcting search mechanism that adapts based on intermediate results, and empirical evidence showing comparable performance compared to current AI search systems.

## 2. What's Already Out There
### 2.1 Current AI Search Systems
Several AI search platforms have become popular recently. These systems combine web searching with AI to give direct answers instead of just links. While this is a big improvement over traditional search, most of these systems use similar approaches — one large AI model handles the entire process.

### 2.2 Why Single-Model Systems Have Problems
When one AI model does everything, several problems emerge. The model can't specialize in any particular task because it has to be good at all of them. It also uses the same amount of computing power for simple tasks as it does for complex ones. Most importantly, these systems don't adapt their search strategy based on what they find.

### 2.3 Multi-Agent Systems in Other Areas
The idea of using multiple AI agents for different tasks has worked well in other fields. Teams of AI agents have solved complex problems in areas like game playing and robotics. However, nobody has really applied this approach to AI search in a systematic way.

## 3. How Our System Works
Our system has three AI agents that work together in sequence. Think of it like an assembly line where each worker has a specific skill.

### 3.1 Agent 1: The Query Analyst and Tool Caller
The first agent serves as the system's entry point and handles query deconstruction and initial tool invocation. When a user submits a query, this agent performs several critical functions:
- **Query Analysis:** The agent breaks down the user's query to understand the underlying intent, required information type, and optimal search strategy. It identifies whether the query needs factual lookup, comparative analysis, real-time information, or complex research.

- **Tool Call Generation:** Based on the query analysis, the agent generates appropriate tool calls. For web searches, it can either use refined search terms extracted from the query or pass the raw query depending on which approach is likely to be more effective.

- **Strategic Routing:** The agent determines which tools are most appropriate for the specific query type. This includes web search for information retrieval, calculators for computational tasks, or other specialized tools.

The agent uses a smaller, specialized model optimized for query understanding and tool selection, making it much more efficient than using a large general-purpose model for this focused task.

### 3.2 Agent 2: The Information Strategist and Content Curator
The second agent receives tool call results and makes critical decisions about information sufficiency and content acquisition strategy. This agent performs several sophisticated functions:
- **Information Assessment:** Upon receiving search results, the agent evaluates whether the available information is sufficient to answer the original query comprehensively. It analyzes snippet content, relevance indicators, and coverage completeness.

- **Scraping Decision Logic:** When snippets appear insufficient, the agent identifies the most promising URLs and determines the optimal scraping strategy.

- **Deep Thinking Search Trigger:** The agent analyzes search results for opportunities to improve the search strategy. It identifies technical terms, related concepts, or information gaps that suggest more targeted searches. When such opportunities are detected, it can trigger a recursive step that reverses the workflow for 1-2 iterations, sending the refined terms back to Agent 1.

- **Quality Control:** The agent implements filters to ensure scraped content quality and relevance, preventing the inclusion of low-value information in the final processing pipeline.

This agent uses a model specifically trained for information evaluation and strategic decision-making, enabling it to make nuanced judgments about information quality and completeness that would be difficult for a general-purpose model.

### 3.3 Agent 3: The Response Formatter and Visual Synthesizer
The third agent specializes exclusively in answer formatting and presentation without adding any new information. This design prevents hallucinations by ensuring the agent only works with verified data from previous stages.
- **Data-Only Processing:** The agent receives curated information from Agent 2 and focuses solely on organizing and presenting this data effectively. It does not generate new factual content or fill information gaps.

- **Visual Analysis and Tool Selection:** The agent analyzes the available information to determine optimal presentation formats. It uses tools like `Chart.js` for data visualizations, `Grid.js` for tabular data, and Markdown for structured text.

- **Response Structuring:** The agent creates coherent, well-organized responses by arranging information logically, creating appropriate headings, and ensuring readability. It can format responses as narrative text, bullet points, tables, charts, or combinations thereof.

- **Consistency and Quality Assurance:** The agent ensures formatting consistency, proper citation of sources, and adherence to response quality standards.

By limiting this agent to formatting and presentation tasks while prohibiting content generation, the system maintains high factual accuracy and reduces the risk of AI hallucinations that plague many current systems.

## 4. Deep Thinking Search: Recursive Self-Correction
The most innovative part of our system is how it can automatically reverse and improve its own search process through recursive workflow steps.

### 4.1 How the Recursive Mechanism Works
Here's how **Deep Thinking Search** operates: Let's say someone searches for "climate change effects." The system processes this through Agent 1 (tool calling) and Agent 2 (information assessment). But then Agent 2, while analyzing the search results, notices that many results mention specific technical terms like **"sea level rise,"** **"ocean acidification,"** and **"extreme weather patterns."**
Instead of just proceeding to Agent 3, Agent 2 recognizes that these more specific terms could yield much better, more targeted information. At this point, it triggers a recursive step — it reverses the workflow and sends these refined terms back to Agent 1 to reinitiate the search process with this new knowledge along with access to the previous knowledge. This creates a feedback loop where the system gets smarter about what to search for based on what it initially found.

### 4.2 The Recursive Workflow Process
When **Deep Thinking Search** is triggered, the system performs these steps:
1. **Analysis Phase:** Agent 2 identifies better search terms from initial results.

2. **Recursive Trigger:** Instead of moving forward, the system reverses the flow.

3. **Re-initiation:** The refined terms are sent back to Agent 1 for new tool calls.

4. **Enhanced Results:** Agent 2 now has both original and targeted search results.

5. **Integration:** All information is combined before proceeding to Agent 3.

The system can perform 1-2 recursive steps to prevent endless loops while still allowing for significant search improvement. This self-correcting mechanism continuously steers the workflow toward more relevant and correct information.

### 4.3 Why Recursive Search Makes a Big Difference
Most current AI search systems process queries linearly — they search once with the user's original terms and work with whatever results they get. Our recursive approach allows the system to discover information pathways that the user might not have known to ask for.
This recursive self-correction often uncovers more specific, technical, or comprehensive information that dramatically improves answer quality. It's like having a research assistant who not only finds information but also realizes halfway through that there's a much better way to search and automatically tries that approach.

## 5. Building and Testing the System
### 5.1 How We Built It
We built our system using a **modular design** where each agent can work independently while communicating with the others. The agents pass structured messages between each other that include the task details and any data they need to share.
Each agent was trained specifically for its role. The Planner learned from thousands of examples of questions and their best handling approaches. The Strategist learned to evaluate information quality and make resource decisions. The Synthesizer learned to combine information from multiple sources into clear answers.

### 5.2 Testing Against Other Systems
We tested our system against current AI search platforms using a set of 10 general questions covering science, history, current events, how-to questions, and other topics.
We measured three main things:
- **Answer Quality:** How good and complete were the answers?

- **Readability, Structure, and Comprehensiveness**: This metric evaluates how easy the answer is to read with it's structures visual hierarchy, and if it covers the topics thoroughly.

### 5.3 Results
Our system demonstrates performance comparable with Perplexity Pro. The following evaluations are based on an average of the benchmark question set.

| **What We Measured**                                                                                                                              | **YouTopia Search** | **Perplexity PRO** |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------ |
| Answer Quality (reproducible results, evaluated by [Claude-4-sonnet](https://claude.ai/share/649517a8-46f1-4859-9e3e-86357cb3042e "null"))        | **8.5/10**          | 8.9/10             |
| Readability, structure and comprehensiveness (reproducible results, evaluated by [Gemini-2.5-Pro](https://g.co/gemini/share/d0d6d2f44ad9 "null")) | **10/10**           | 8.3/10             |

_The evaluations are based over an average of the benchmark [question set](https://github.com/YouTopia-labs/YouTopia-Search-Benchmarks/blob/49e396837f4426176767d09c6d12b3ccd0bcccea/Question%20set.md "null")_

**Perplexity Pro responses:** [View here](https://github.com/YouTopia-labs/YouTopia-Search-Benchmarks/blob/49e396837f4426176767d09c6d12b3ccd0bcccea/Perplexity%20Pro%20responses.md#1science)
**YouTopia Search responses:** [View here](https://github.com/YouTopia-labs/YouTopia-Search-Benchmarks/blob/49e396837f4426176767d09c6d12b3ccd0bcccea/YouTopia%20Search%20responses.md)
## 6. What We Learned
### 6.1 Why the Multi-Agent Approach Works
Having three specialized agents instead of one general-purpose AI provides several advantages:
- Each agent can be really good at its specific job instead of being mediocre at everything.

- The system uses computing resources more efficiently because simple tasks don't require the same power as complex ones.

- When we want to improve one part of the system, we can focus on just that agent without rebuilding everything.

The biggest advantage is the **Deep Thinking Search** capability. Current AI search systems are limited by the user's original question and process queries linearly. Our system can discover better ways to search through recursive workflow steps, where insights from initial results trigger the system to reverse the flow and restart with refined search terms, continuously steering toward more relevant information.

### 6.2 Current Limitations
Our system isn't perfect. It depends on external search engines, so it's limited by what those systems can find. If one agent makes a mistake, it can affect the final answer. We've mostly tested it on general questions and a limited preview user base of 100 users so we're yet to discover caveats where the model could fail drastically

### 6.3 What We're Working on Next
We're planning several improvements. We want to add specialized knowledge databases for topics like medicine and law. We're working on better error checking between agents. We also want to test the system on more specialized and technical questions to see how it performs.

## 7. Conclusion
We built a new kind of AI search system that works fundamentally differently from current approaches. Instead of using one large AI model to handle everything, we created **three specialized agents** that work together as a team.
The key innovations are the **multi-agent architecture** and the **Deep Thinking Search** mechanism. The specialized agents are more efficient and effective at their individual tasks. The **Deep Thinking Search** feature allows the system to discover better information by automatically reversing the workflow when it identifies superior search terms, performing recursive steps that continuously steer the search process toward more relevant and comprehensive results.
Our testing shows that this approach produces answers comparable to, and in some aspects exceeding, those of leading AI search platforms. Our system also demonstrates improved efficiency.
This work opens up new possibilities for how AI systems can work together to solve complex problems. Instead of building ever-larger single models, we can create teams of specialized agents that are more efficient and effective at specific tasks.
The future of AI search might not be about building bigger models, but about building smarter teams of models that know how to work together.
