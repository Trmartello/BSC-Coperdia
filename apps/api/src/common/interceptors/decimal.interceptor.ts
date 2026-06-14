import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Prisma serializa Decimal como string no JSON. Isso quebra o frontend
// (ex.: value.toFixed() em string). Este interceptor converte qualquer
// Decimal (duck-typing) em number recursivamente em toda a resposta.

function isDecimal(v: any): boolean {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof v.toNumber === 'function' &&
    typeof v.toFixed === 'function' &&
    !(v instanceof Date)
  );
}

function convert(value: any): any {
  if (value === null || value === undefined) return value;
  if (isDecimal(value)) return value.toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convert);
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      value[key] = convert(value[key]);
    }
    return value;
  }
  return value;
}

@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => convert(data)));
  }
}
