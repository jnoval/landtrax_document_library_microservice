import { of } from 'rxjs';

export class HttpService {
  post = jest.fn().mockReturnValue(of({ data: { success: true } }));
  get = jest.fn().mockReturnValue(of({ data: { success: true } }));
  put = jest.fn().mockReturnValue(of({ data: { success: true } }));
  delete = jest.fn().mockReturnValue(of({ data: { success: true } }));
  patch = jest.fn().mockReturnValue(of({ data: { success: true } }));
  axiosRef = {
    post: jest.fn().mockResolvedValue({ data: { success: true } }),
    get: jest.fn().mockResolvedValue({ data: { success: true } }),
    delete: jest.fn().mockResolvedValue({ data: { success: true } }),
  };
}

export class HttpModule {
  static register = jest.fn().mockReturnValue({
    module: HttpModule,
    providers: [HttpService],
    exports: [HttpService],
  });
  static registerAsync = jest.fn().mockReturnValue({
    module: HttpModule,
    providers: [HttpService],
    exports: [HttpService],
  });
}
