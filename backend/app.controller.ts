import { Controller, Get } from '@nestjs/common';

/**
 * Root route. Render's health check and casual `curl <base-url>/` requests
 * otherwise 404 since no controller claims `GET /` — this just gives a
 * friendly pointer instead of the framework's default "Cannot GET /".
 */
@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: 'Dayjoy AI Enterprise API',
      status: 'ok',
      health: '/health',
    };
  }
}
