# MissionMind — Explainable AI Mission Control

**Advance Space Exploration with AI (IBM AI Builders Challenge)**

MissionMind is an Explainable AI (XAI) decision-support platform engineered to bridge the telemetry chasm between heavy spacecraft data generation and human comprehension. Powered by **IBM watsonx.ai (Granite models)**, it acts as an intelligent mission assistant that continuously monitors live telemetry, detects operational anomalies, and generates actionable, explainable recommendations while keeping human operators in absolute command.

---
## 🚨 The Problem
Modern spacecraft generate massive amounts of low-level telemetry data. During critical moments, human operators face a "telemetry chasm"—the overwhelming cognitive load of manually decoding raw metrics, voltage drops, and error codes, which severely delays rapid decision-making.

## 💡 The Solution
MissionMind acts as an Explainable AI (XAI) mission assistant to bridge this gap. It leverages IBM Granite models to continuously monitor live data, suppress normal background noise, and instantly translate complex anomalies into plain-language, actionable briefings. It provides strategic recommendations while ensuring the human operator retains absolute command through a mandatory "Approve/Reject" decision log.

## 🚀 Key Features

* **Adaptive Mission Briefing:** Consumes a unified telemetry state and splits it into two distinct AI narratives simultaneously:
  * *Operator Brief:* A high-density, technical log built for tactical flight decisions.
  * *Public Digest:* A jargon-free, engaging translation for public observers and STEM education.
* **Intelligent Noise Reduction:** Visually suppresses normal subsystem readings into the background while aggressively highlighting critical anomalies.
* **Human-in-the-Loop Decision Log:** Provides AI-driven recommendations with confidence scores and reasoning, requiring a mandatory human "Approve/Reject" checkpoint before logging actions.
* **Resilient Fallback System:** Seamlessly transitions to deterministic offline simulation mode if cloud connectivity drops, featuring clear "GRANITE (Live)" vs. "SIMULATED" badges.

---

## 🧠 AI Approach & Architecture

* **Core AI Engine:** Utilizes **IBM watsonx.ai** with **IBM Granite Instruct models** configured with strict decoding parameters (Temperature = 0.0) to guarantee deterministic, hallucination-free outputs.
* **Secure Proxy Architecture:** Implements a custom Node.js server-side proxy layer to securely handle API calls and protect environment secrets (`WATSONX_API_KEY`).
* **Frontend Dashboard:** Built with **React 19, Vite, and Tailwind CSS**, featuring real-time data visualizers powered by Recharts.

---

## 🛠️ How IBM Bob Was Used
IBM Bob was utilized as a core development assistant throughout the creation of this project—assisting in architectural planning, structuring the secure Node.js proxy layer, optimizing prompt templates for the Granite models, and refining the real-time anomaly handling workflow.

---

## ⚙️ Quick Start

1. Clone the repository:
   ```bash
   git clone [https://github.com/your-username/mission-mind.git](https://github.com/your-username/mission-mind.git)

   
