import PdfWorker from 'pdfjs-dist/build/pdf.worker?worker'

type PdfJsLike = {
    GlobalWorkerOptions: {
        workerPort: Worker | null
    }
}

/**
 * pdf.js 워커를 설정한다.
 *
 * 워커 파일 URL(`?worker&url`) 대신 워커 인스턴스(`workerPort`)를 넘기는 방식을 사용한다.
 * 이렇게 해야 단독 HTML 빌드에서 워커 코드가 번들 안에 인라인되어 별도 파일 없이 동작한다.
 * 워커는 처음 필요할 때 한 번만 만들고 이후에는 재사용한다.
 */
export function setupPdfWorker(pdfjsLib: PdfJsLike) {
    if (!pdfjsLib.GlobalWorkerOptions.workerPort) {
        pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()
    }
}
