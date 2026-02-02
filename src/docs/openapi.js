const openapiSpec = {
  openapi: "3.0.0",
  info: {
    title: "StudySummarize API",
    version: "1.0.0",
    description: "API for summaries and AI exam generation.",
  },
  servers: [
    {
      url: "http://localhost:3000",
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: {
          200: {
            description: "OK",
          },
        },
      },
    },
    "/api/summarize": {
      post: {
        summary: "Summarize study text",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  length: { type: "string", enum: ["short", "medium", "detailed", "unlimited"] },
                  format: { type: "string", enum: ["paragraph", "bullets"] },
                },
                required: ["text", "length", "format"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Summary response",
          },
        },
      },
    },
    "/api/exams/generate": {
      post: {
        summary: "Generate a new exam",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExamGenerateRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Exam generated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Exam" },
              },
            },
          },
          422: {
            description: "Exam generation failed to meet requested quotas",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    code: { type: "string", example: "EXAM_GENERATION_FAILED" },
                    missing: { type: "object", additionalProperties: { type: "integer" } },
                    reason: { type: "string", example: "validation-too-strict" },
                    debug: {
                      type: "object",
                      properties: {
                        subjectCategory: { type: "string", example: "math" },
                        attemptsByType: {
                          type: "object",
                          additionalProperties: { type: "integer" },
                        },
                        lastErrorsByType: {
                          type: "object",
                          additionalProperties: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                reason: { type: "string" },
                                count: { type: "integer" },
                              },
                            },
                          },
                        },
                        exampleFailedCandidates: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              templateId: { type: ["string", "null"] },
                              templateFamily: { type: ["string", "null"] },
                              prompt: { type: "string" },
                              choices: { type: "array", items: { type: "string" } },
                              answerKey: { type: "string" },
                              issues: { type: "array", items: { type: "string" } },
                            },
                          },
                        },
                        templateFailures: {
                          type: "object",
                          additionalProperties: { type: "integer" },
                        },
                      },
                    },
                  },
                  required: ["code", "missing", "reason"],
                },
              },
            },
          },
        },
      },
    },
    "/api/exams": {
      get: {
        summary: "List exams",
        responses: {
          200: {
            description: "Exam list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ExamListItem" },
                },
              },
            },
          },
        },
      },
    },
    "/api/exams/{id}": {
      get: {
        summary: "Get exam by id",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Exam detail",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Exam" },
              },
            },
          },
        },
      },
    },
    "/api/exams/{id}/submit": {
      post: {
        summary: "Submit exam answers",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExamSubmissionRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Grading response",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExamSubmissionResponse" },
              },
            },
          },
        },
      },
    },
    "/api/exams/{id}/attempts": {
      get: {
        summary: "List exam attempts",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Attempt list",
          },
        },
      },
    },
    "/api/attempts/{attemptId}": {
      get: {
        summary: "Get attempt details",
        parameters: [
          { name: "attemptId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Attempt detail",
          },
        },
      },
    },
    "/api/exams/{id}/export": {
      get: {
        summary: "Export exam",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "format",
            in: "query",
            schema: { type: "string", enum: ["json", "html"] },
          },
          {
            name: "withAnswers",
            in: "query",
            schema: { type: "string", enum: ["true", "false"] },
          },
        ],
        responses: {
          200: {
            description: "Export response",
          },
        },
      },
    },
    "/api/knowledge/sources": {
      get: {
        summary: "List knowledge base sources",
        responses: {
          200: {
            description: "Knowledge sources list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sources: {
                      type: "array",
                      items: { $ref: "#/components/schemas/KnowledgeSource" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ExamConfig: {
        type: "object",
        properties: {
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          questionCount: { type: "integer", minimum: 5, maximum: 30 },
          types: {
            type: "object",
            properties: {
              mcq: { type: "integer" },
              trueFalse: { type: "integer" },
              shortAnswer: { type: "integer" },
              fillBlank: { type: "integer" },
            },
          },
          strictTypes: { type: "boolean", example: true },
          language: { type: "string", example: "en" },
        },
      },
      ExamQuestion: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["mcq", "trueFalse", "shortAnswer", "fillBlank"] },
          prompt: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
          answerKey: { type: "string" },
          answerKeyBool: { type: "boolean" },
          answerKeyText: { type: "array", items: { type: "string" } },
          answerKeyBlank: { type: "string" },
          classification: {
            type: "string",
            enum: ["Definition", "Concept", "Fact", "Application"],
          },
          explanation: { type: "string" },
          points: { type: "number" },
          meta: {
            type: "object",
            properties: {
              templateId: { type: "string" },
              templateFamily: { type: "string" },
              regeneratedFrom: { type: ["string", "null"] },
              subjectCategory: { type: "string", example: "science" },
            },
          },
        },
      },
      Exam: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          createdAt: { type: "string" },
          config: { $ref: "#/components/schemas/ExamConfig" },
          questions: { type: "array", items: { $ref: "#/components/schemas/ExamQuestion" } },
          totalPoints: { type: "number" },
          meta: {
            type: "object",
            properties: {
              seed: { type: "string" },
              subjectCategory: { type: "string", example: "mixed" },
            },
          },
        },
      },
      KnowledgeSource: {
        type: "object",
        properties: {
          source: { type: "string", example: "OpenStax" },
          license: { type: "string", example: "CC-BY-4.0" },
        },
      },
      ExamListItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          createdAt: { type: "string" },
          difficulty: { type: "string" },
          questionCount: { type: "integer" },
        },
      },
      ExamGenerateRequest: {
        type: "object",
        properties: {
          text: { type: "string" },
          title: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          questionCount: { type: "integer", minimum: 5, maximum: 30 },
          seed: { type: "string" },
          types: {
            type: "object",
            properties: {
              mcq: { type: "integer" },
              trueFalse: { type: "integer" },
              shortAnswer: { type: "integer" },
              fillBlank: { type: "integer" },
            },
          },
          strictTypes: { type: "boolean", example: true },
        },
        required: ["text"],
        example: {
          text: "Paste study notes here...",
          difficulty: "medium",
          questionCount: 10,
          types: { mcq: 4, trueFalse: 2, shortAnswer: 2, fillBlank: 2 },
          strictTypes: true,
        },
      },
      ExamSubmissionRequest: {
        type: "object",
        properties: {
          examId: { type: "integer" },
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionId: { type: "string" },
                type: { type: "string" },
                value: { type: "string" },
              },
            },
          },
        },
      },
      ExamSubmissionResponse: {
        type: "object",
        properties: {
          attemptId: { type: "string" },
          examId: { type: "integer" },
          score: {
            type: "object",
            properties: {
              earned: { type: "number" },
              total: { type: "number" },
              percent: { type: "number" },
            },
          },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionId: { type: "string" },
                correct: { type: "boolean" },
                earnedPoints: { type: "number" },
                maxPoints: { type: "number" },
                feedback: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = openapiSpec;
