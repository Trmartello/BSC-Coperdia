'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// A aba "Indicadores" foi descontinuada: toda a gestão de indicadores passou a
// ser feita diretamente no Mapa Estratégico. Esta rota apenas redireciona.
export default function IndicatorsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/maps');
  }, [router]);
  return (
    <div className="flex items-center justify-center h-[60vh] text-white/30 text-sm">
      Redirecionando para o Mapa Estratégico…
    </div>
  );
}
