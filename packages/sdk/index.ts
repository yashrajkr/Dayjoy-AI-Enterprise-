import axios, { AxiosInstance } from 'axios';

export class DayjoySDK {
  private client: AxiosInstance;

  constructor(apiKey: string, baseURL = 'https://api.dayjoy.ai') {
    this.client = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
  }

  async getCustomer(id: string) { return (await this.client.get(`/api/customers/${id}`)).data; }
  async listProducts(page = 1, limit = 20) { return (await this.client.get(`/api/products?page=${page}&limit=${limit}`)).data; }
  async createLead(data: any) { return (await this.client.post('/api/leads', data)).data; }
  async ragQuery(query: string) { return (await this.client.post('/api/knowledge/query', { query })).data; }
}

export default DayjoySDK;
