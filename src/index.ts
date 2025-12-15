import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

// HuggingFace 토큰 파일에서 읽기
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// HuggingFace 토큰 로드 (환경변수 또는 파일에서)
const HF_TOKEN = process.env.HF_TOKEN || (() => {
    try {
        return readFileSync(join(__dirname, '..', 'huggingface_token'), 'utf-8').trim()
    } catch {
        return ''
    }
})()

// Create server instance
const server = new McpServer({
    name: 'YOUR_SERVER_NAME',
    version: '1.0.0'
})

server.registerTool(
    'greet',
    {
        description: '이름과 언어를 입력하면 인사말을 반환합니다.',
        inputSchema: z.object({
            name: z.string().describe('인사할 사람의 이름'),
            language: z
                .enum(['ko', 'en'])
                .optional()
                .default('en')
                .describe('인사 언어 (기본값: en)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('인사말')
                    })
                )
                .describe('인사말')
        })
    },
    async ({ name, language }) => {
        const greeting =
            language === 'ko'
                ? `안녕하세요, ${name}님!`
                : `Hey there, ${name}! 👋 Nice to meet you!`

        return {
            content: [
                {
                    type: 'text' as const,
                    text: greeting
                }
            ],
            structuredContent: {
                content: [
                    {
                        type: 'text' as const,
                        text: greeting
                    }
                ]
            }
        }
    }
)

server.registerTool(
    'calculator',
    {
        description: '두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
        inputSchema: z.object({
            number1: z.number().describe('첫 번째 숫자'),
            number2: z.number().describe('두 번째 숫자'),
            operator: z
                .enum(['+', '-', '*', '/'])
                .describe('연산자 (+, -, *, /)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('계산 결과')
                    })
                )
                .describe('계산 결과')
        })
    },
    async ({ number1, number2, operator }) => {
        let result: number
        let expression: string

        switch (operator) {
            case '+':
                result = number1 + number2
                expression = `${number1} + ${number2}`
                break
            case '-':
                result = number1 - number2
                expression = `${number1} - ${number2}`
                break
            case '*':
                result = number1 * number2
                expression = `${number1} * ${number2}`
                break
            case '/':
                if (number2 === 0) {
                    throw new Error('0으로 나눌 수 없습니다.')
                }
                result = number1 / number2
                expression = `${number1} / ${number2}`
                break
        }

        const resultText = `${expression} = ${result}`

        return {
            content: [
                {
                    type: 'text' as const,
                    text: resultText
                }
            ],
            structuredContent: {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ]
            }
        }
    }
)

server.registerTool(
    'get_time',
    {
        description: '시간대를 입력받아 해당 시간대의 현재 시간을 반환합니다.',
        inputSchema: z.object({
            timezone: z
                .string()
                .describe('시간대 (IANA timezone 형식, 예: Asia/Seoul, America/New_York, Europe/London)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('현재 시간')
                    })
                )
                .describe('현재 시간')
        })
    },
    async ({ timezone }) => {
        try {
            const now = new Date()
            const formatter = new Intl.DateTimeFormat('ko-KR', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })

            const formattedTime = formatter.format(now)
            const resultText = `시간대: ${timezone}\n현재 시간: ${formattedTime}`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ]
                }
            }
        } catch (error) {
            throw new Error(`유효하지 않은 시간대입니다: ${timezone}`)
        }
    }
)

server.registerTool(
    'geocode',
    {
        description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다.',
        inputSchema: z.object({
            query: z
                .string()
                .describe('검색할 도시 이름이나 주소 (예: "Seoul", "New York", "서울시 강남구")')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('위도와 경도 좌표')
                    })
                )
                .describe('위도와 경도 좌표')
        })
    },
    async ({ query }) => {
        try {
            // Nominatim API 엔드포인트
            const baseUrl = 'https://nominatim.openstreetmap.org/search'
            const params = new URLSearchParams({
                q: query,
                format: 'json',
                limit: '1'
            })

            const response = await fetch(`${baseUrl}?${params.toString()}`, {
                headers: {
                    'User-Agent': 'MCP-Server/1.0.0' // Nominatim은 User-Agent 필수
                }
            })

            if (!response.ok) {
                throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()

            if (!data || data.length === 0) {
                throw new Error(`주소를 찾을 수 없습니다: ${query}`)
            }

            const result = data[0]
            const lat = parseFloat(result.lat)
            const lon = parseFloat(result.lon)
            const displayName = result.display_name || query

            const resultText = `주소: ${displayName}\n위도: ${lat}\n경도: ${lon}\n좌표: (${lat}, ${lon})`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ]
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`지오코딩 오류: ${error.message}`)
            }
            throw new Error(`지오코딩 오류가 발생했습니다.`)
        }
    }
)

server.registerTool(
    'get_weather',
    {
        description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다.',
        inputSchema: z.object({
            latitude: z.number().describe('위도 (WGS84 좌표계)'),
            longitude: z.number().describe('경도 (WGS84 좌표계)'),
            forecast_days: z
                .number()
                .int()
                .min(1)
                .max(16)
                .optional()
                .default(7)
                .describe('예보 기간 (일 단위, 기본값: 7일, 최대: 16일)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('날씨 정보')
                    })
                )
                .describe('날씨 정보')
        })
    },
    async ({ latitude, longitude, forecast_days = 7 }) => {
        try {
            // Open-Meteo Weather API 엔드포인트
            const baseUrl = 'https://api.open-meteo.com/v1/forecast'
            const params = new URLSearchParams({
                latitude: latitude.toString(),
                longitude: longitude.toString(),
                current_weather: 'true',
                hourly: 'temperature_2m,relativehumidity_2m,precipitation,weathercode,windspeed_10m',
                daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode',
                forecast_days: forecast_days.toString(),
                timezone: 'auto'
            })

            const response = await fetch(`${baseUrl}?${params.toString()}`)

            if (!response.ok) {
                throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()

            if (data.error) {
                throw new Error(`API 오류: ${data.reason}`)
            }

            // 현재 날씨 정보
            const current = data.current_weather
            const currentTemp = current.temperature
            const currentWeathercode = current.weathercode
            const currentWindSpeed = current.windspeed

            // 일별 예보 정보 (첫 3일)
            const daily = data.daily
            const dailyForecast = []
            const daysToShow = Math.min(forecast_days, 3) // 처음 3일만 표시

            for (let i = 0; i < daysToShow; i++) {
                dailyForecast.push({
                    date: daily.time[i],
                    maxTemp: daily.temperature_2m_max[i],
                    minTemp: daily.temperature_2m_min[i],
                    precipitation: daily.precipitation_sum[i],
                    weathercode: daily.weathercode[i]
                })
            }

            // 날씨 코드를 텍스트로 변환하는 함수
            const getWeatherDescription = (code: number): string => {
                const weatherCodes: Record<number, string> = {
                    0: '맑음',
                    1: '대체로 맑음',
                    2: '부분적으로 흐림',
                    3: '흐림',
                    45: '안개',
                    48: '침적 안개',
                    51: '약한 이슬비',
                    53: '보통 이슬비',
                    55: '강한 이슬비',
                    56: '약한 동결 이슬비',
                    57: '강한 동결 이슬비',
                    61: '약한 비',
                    63: '보통 비',
                    65: '강한 비',
                    66: '약한 동결 비',
                    67: '강한 동결 비',
                    71: '약한 눈',
                    73: '보통 눈',
                    75: '강한 눈',
                    77: '눈알갱이',
                    80: '약한 소나기',
                    81: '보통 소나기',
                    82: '강한 소나기',
                    85: '약한 눈 소나기',
                    86: '강한 눈 소나기',
                    95: '뇌우',
                    96: '우박과 함께 뇌우',
                    99: '강한 우박과 함께 뇌우'
                }
                return weatherCodes[code] || `날씨 코드: ${code}`
            }

            // 결과 텍스트 생성
            let resultText = `📍 위치: 위도 ${latitude}, 경도 ${longitude}\n\n`
            resultText += `🌡️ 현재 날씨\n`
            resultText += `온도: ${currentTemp}°C\n`
            resultText += `날씨: ${getWeatherDescription(currentWeathercode)}\n`
            resultText += `풍속: ${currentWindSpeed} km/h\n\n`

            resultText += `📅 ${forecast_days}일 예보 (처음 ${daysToShow}일)\n`
            dailyForecast.forEach((day, index) => {
                const date = new Date(day.date)
                const dateStr = date.toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                })
                resultText += `\n${dateStr}\n`
                resultText += `최고: ${day.maxTemp}°C / 최저: ${day.minTemp}°C\n`
                resultText += `날씨: ${getWeatherDescription(day.weathercode)}\n`
                if (day.precipitation > 0) {
                    resultText += `강수량: ${day.precipitation} mm\n`
                }
            })

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ]
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`날씨 정보 조회 오류: ${error.message}`)
            }
            throw new Error(`날씨 정보 조회 중 오류가 발생했습니다.`)
        }
    }
)

server.registerTool(
    'generate_image',
    {
        description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다. (FLUX.1-schnell 모델 사용)',
        inputSchema: z.object({
            prompt: z.string().describe('생성할 이미지에 대한 설명 (예: "Astronaut riding a horse")')
        })
    },
    async ({ prompt }) => {
        try {
            if (!HF_TOKEN) {
                throw new Error('HuggingFace 토큰이 설정되지 않았습니다. HF_TOKEN 환경변수를 설정하거나 huggingface_token 파일을 생성하세요.')
            }

            const client = new InferenceClient(HF_TOKEN)

            const imageResult = await client.textToImage({
                provider: 'auto',
                model: 'black-forest-labs/FLUX.1-schnell',
                inputs: prompt,
                parameters: { num_inference_steps: 4 }
            })

            // 결과를 Blob으로 변환
            const imageBlob = imageResult as unknown as Blob

            // Blob을 Base64로 변환
            const arrayBuffer = await imageBlob.arrayBuffer()
            const base64Data = Buffer.from(arrayBuffer).toString('base64')

            return {
                content: [
                    {
                        type: 'image' as const,
                        data: base64Data,
                        mimeType: 'image/png'
                    }
                ]
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`이미지 생성 오류: ${error.message}`)
            }
            throw new Error(`이미지 생성 중 오류가 발생했습니다.`)
        }
    }
)

// 서버 정보 리소스 등록
server.registerResource(
    'server-info',
    'mcp://server-info',
    {
        title: '서버 정보',
        description: '현재 MCP 서버의 정보와 사용 가능한 도구, 리소스, 프롬프트 목록',
        mimeType: 'application/json'
    },
    async () => {
        // 등록된 도구 목록 수집
        const tools = [
            {
                name: 'greet',
                description: '이름과 언어를 입력하면 인사말을 반환합니다.',
                parameters: {
                    name: 'string',
                    language: 'enum["ko", "en"] (optional, default: "en")'
                }
            },
            {
                name: 'calculator',
                description: '두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
                parameters: {
                    number1: 'number',
                    number2: 'number',
                    operator: 'enum["+", "-", "*", "/"]'
                }
            },
            {
                name: 'get_time',
                description: '시간대를 입력받아 해당 시간대의 현재 시간을 반환합니다.',
                parameters: {
                    timezone: 'string (IANA timezone 형식)'
                }
            },
            {
                name: 'geocode',
                description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다.',
                parameters: {
                    query: 'string (도시 이름이나 주소)'
                }
            },
            {
                name: 'get_weather',
                description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다.',
                parameters: {
                    latitude: 'number (WGS84 좌표계)',
                    longitude: 'number (WGS84 좌표계)',
                    forecast_days: 'number (1-16, optional, default: 7)'
                }
            },
            {
                name: 'generate_image',
                description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다. (FLUX.1-schnell 모델 사용)',
                parameters: {
                    prompt: 'string (생성할 이미지에 대한 설명)'
                },
                output: 'base64 인코딩된 이미지 (image/png)'
            }
        ]

        // 등록된 프롬프트 목록 수집
        const prompts = [
            {
                name: 'code-review',
                title: '코드 리뷰',
                description: '코드를 입력받아 코드 리뷰를 위한 프롬프트를 생성합니다.',
                parameters: {
                    code: 'string (리뷰할 코드)',
                    language: 'string (optional, 프로그래밍 언어)',
                    focus: 'enum["performance", "security", "best-practices", "readability", "all"] (optional, default: "all")'
                }
            }
        ]

        // 등록된 리소스 목록 수집
        const resources = [
            {
                name: 'server-info',
                uri: 'mcp://server-info',
                title: '서버 정보',
                description: '현재 MCP 서버의 정보와 사용 가능한 도구, 리소스, 프롬프트 목록',
                mimeType: 'application/json'
            }
        ]

        const serverInfo = {
            server: {
                name: 'my_mcp_server',
                version: '1.0.0',
                description: 'MCP 서버 - 다양한 유틸리티 도구, 리소스, 프롬프트 제공'
            },
            capabilities: {
                tools: {
                    count: tools.length,
                    list: tools
                },
                prompts: {
                    count: prompts.length,
                    list: prompts
                },
                resources: {
                    count: resources.length,
                    list: resources
                }
            },
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                architecture: process.arch
            },
            runtime: {
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                uptimeFormatted: `${Math.floor(process.uptime() / 3600)}시간 ${Math.floor((process.uptime() % 3600) / 60)}분 ${Math.floor(process.uptime() % 60)}초`
            }
        }

        return {
            contents: [
                {
                    uri: 'mcp://server-info',
                    mimeType: 'application/json',
                    text: JSON.stringify(serverInfo, null, 2)
                }
            ]
        }
    }
)

// 코드 리뷰 프롬프트 등록
server.registerPrompt(
    'code-review',
    {
        title: '코드 리뷰',
        description: '코드를 입력받아 코드 리뷰를 위한 프롬프트를 생성합니다.',
        argsSchema: {
            code: z.string().describe('리뷰할 코드'),
            language: z
                .string()
                .optional()
                .describe('프로그래밍 언어 (예: typescript, javascript, python 등)'),
            focus: z
                .enum(['performance', 'security', 'best-practices', 'readability', 'all'])
                .optional()
                .default('all')
                .describe('리뷰 포커스 영역 (기본값: all)')
        }
    },
    async ({ code, language, focus = 'all' }) => {
        // 코드 리뷰 프롬프트 템플릿
        const reviewTemplate = `다음 코드를 리뷰해주세요. 다음 항목들을 중점적으로 검토해주세요:

## 리뷰 포인트

### 1. 코드 품질 및 가독성
- 코드의 가독성과 명확성
- 네이밍 컨벤션 준수 여부
- 주석 및 문서화
- 코드 구조 및 조직

### 2. 성능 및 최적화
- 알고리즘 효율성
- 불필요한 연산이나 중복 코드
- 메모리 사용 최적화
- 비동기 처리 적절성

### 3. 보안
- 입력값 검증 및 sanitization
- 보안 취약점 (SQL injection, XSS 등)
- 인증 및 권한 관리
- 민감 정보 처리

### 4. 모범 사례
- 언어별 모범 사례 준수
- 디자인 패턴 적용
- 에러 처리
- 테스트 가능성

### 5. 버그 및 잠재적 문제
- 논리적 오류
- 엣지 케이스 처리
- 타입 안정성
- 경쟁 조건 및 동시성 문제

## 리뷰할 코드

\`\`\`${language || 'text'}
${code}
\`\`\`

## 리뷰 형식

다음 형식으로 리뷰를 제공해주세요:

### ✅ 잘된 점
- 구체적인 칭찬 포인트

### ⚠️ 개선이 필요한 점
- 구체적인 개선 사항과 이유

### 🔧 제안 사항
- 구체적인 개선 코드 예시 (가능한 경우)

### 📝 추가 고려사항
- 추가로 고려해야 할 사항들`

        // 포커스 영역에 따른 추가 지시사항
        const focusInstructions: Record<string, string> = {
            performance: '\n\n**특별히 성능 최적화에 집중해서 리뷰해주세요.**',
            security: '\n\n**특별히 보안 취약점과 보안 모범 사례에 집중해서 리뷰해주세요.**',
            'best-practices': '\n\n**특별히 해당 언어의 모범 사례와 디자인 패턴 준수에 집중해서 리뷰해주세요.**',
            readability: '\n\n**특별히 코드 가독성, 네이밍, 구조에 집중해서 리뷰해주세요.**',
            all: ''
        }

        const finalPrompt = reviewTemplate + focusInstructions[focus]

        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: finalPrompt
                    }
                }
            ]
        }
    }
)

server
    .connect(new StdioServerTransport())
    .catch(console.error)
    .then(() => {
        console.log('MCP server started')
    })
