import fastify from 'fastify';
import fastifyCors from 'fastify-cors';
import {
  AccountConfig,
  TradingApi,
  CreateOrderRequest,
  OrderResponse,
  GetBarsRequest, Bar 
} from 'alpaca-trade-api';
import { OpenAI } from "openai";
import 'dotenv/config'


const config = {
  alpacaApiKey: process.env.ALPACA_API_KEY,
  alpacaApiSecret: process.env.ALPACA_API_SECRET,
  openaiApiKey: process.env.OPENAI_API_KEY,
}

const app = fastify();
const port = 3000;

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});


// Alpaca API configuration
const alpacaConfig: AccountConfig = {
  key: config.alpacaApiKey,
  secret: config.alpacaApiSecret,
  paper: true, // Set to 'false' for live trading
};

async function sendToGptApi(data: any): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    messages.push({ role: "user", content: JSON.stringify(data) });
    messages.push({ role: "assistant", content: JSON.stringify(data) });
    messages.push({ role: "user", content: JSON.stringify(data) });

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: messages,
      });

      const completion_text = completion.created.toString()
      console.log(completion_text);
      return completion_text
    } catch (error) {
      throw error;
    }
}


// Define the current date and time for reference
const now = new Date();

// Calculate the start date for the 4-hour candles (1 week ago from now)
const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days in milliseconds



async function fetchCandles(symbol: string) {
  // Define the request parameters for 5-minute candles over the current day
  const fiveMinCandlesRequest: GetBarsRequest = {
    symbol,
    interval: '5Min',
    start: now.toISOString().slice(0, 10), // Use only the date part
    end: now.toISOString(),
  };

  // Define the request parameters for 4-hour candles over the last week
  const fourHourCandlesRequest: GetBarsRequest = {
    symbol,
    interval: '4Hour',
    start: oneWeekAgo.toISOString(),
    end: now.toISOString(),
  };

  try {
    // Fetch 5-minute candles
    const fiveMinCandles: Bar[] = await alpaca.getBarsV2(fiveMinCandlesRequest);

    // Fetch 4-hour candles
    const fourHourCandles: Bar[] = await alpaca.getBarsV2(fourHourCandlesRequest);

    // Handle and process the retrieved data as needed
    return {
      fourHourCandles,
      fiveMinCandles
    }
  } catch (error) {
    console.error('Error fetching candles:', error);
    throw new Error('Failed to fetch candles')
  }
}

const alpaca = new TradingApi(alpacaConfig);

// Enable CORS for all routes
app.register(fastifyCors);

// Define a route to open a trade
app.post('/tradingview-signal', async (request, reply) => {
  try {
    const signal = request.body; // TradingView signal payload
    const symbol = signal.symbol;
    const qty = signal.qty;
    const side = signal.side;
    const limit_price = signal.limit_price;

    // Create an order request
    const order: CreateOrderRequest = {
      symbol,
      qty,
      side,
      type: 'limit',
      time_in_force: 'gtc',
      limit_price,
    };

    const {fourHourCandles, fiveMinCandles} = await fetchCandles(symbol);

    const gptResponse = await sendToGptApi({
      symbol,
      qty,
      side,
      limit_price,
    });

    // Place the order
    const response: OrderResponse = await alpaca.createOrder(order);

    reply.code(200).send({ message: 'Trade opened successfully', order: response });
  } catch (error) {
    reply.code(500).send({ message: 'Failed to open trade', error: error.message });
  }
});

app.listen({ port: port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server is running on ${address}`);
});
