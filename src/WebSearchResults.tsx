import type { WebSearchPage } from './lib/web-search-contract'
import './web-search-results.css'

type Props = Readonly<{
  page: WebSearchPage
  /** Optional, separately authorized analysis. Never called on search submit. */
  onAnalyze?: (query: string) => void
}>

/**
 * Conventional web search results, not an AI answer.
 * No auth, persistence, analytics, search calls or auto-analysis.
 * Parent must supply genuinely retrieved results, not demo fixtures.
 */
export function WebSearchResults({ page, onAnalyze }: Props) {
  return (
    <section className="web-results" aria-label="Web search results">
      <header className="web-results__heading">
        <p className="web-results__eyebrow">WEB SEARCH</p>
        <h2>Results for <span>{page.query}</span></h2>
        <p className="web-results__time">
          Retrieved {new Date(page.retrievedAt).toLocaleString()}.
          Search links are external sources, not independently verified claims.
        </p>
      </header>
      {page.status === 'empty' ? (
        <div className="web-results__empty" role="status">
          No matching web results were returned. Try a different search.
        </div>
      ) : (
        <ol className="web-results__list">
          {page.results.map((hit) => (
            <li key={hit.url} className="web-results__item">
              <p className="web-results__source">{hit.source}</p>
              <a href={hit.url} className="web-results__link">{hit.title}</a>
              {hit.snippet && <p className="web-results__snippet">{hit.snippet}</p>}
              {hit.publishedAt && (
                <p className="web-results__date">
                  Source date: {new Date(hit.publishedAt).toLocaleDateString()}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {onAnalyze && page.status === 'results' && page.results.length > 0 && (
        <div className="web-results__optional">
          <p>Want to dig deeper? Use Perception to examine sources and competing claims.</p>
          <button type="button" onClick={() => onAnalyze(page.query)}>
            Analyze with PERCEPTION (optional)
          </button>
        </div>
      )}
    </section>
  )
}
