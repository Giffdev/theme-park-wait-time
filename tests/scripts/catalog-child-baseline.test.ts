import { describe, expect, it } from 'vitest';
import reviewedChildCatalog from '../../scripts/data/themeparks-wiki-canonical-children-2026-08-14.json';
import {
  EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256,
  REVIEWED_CHILD_BASELINE_COMMAND,
  summarizeChildCatalogBaseline,
  validateReviewedChildCatalogArtifact,
} from '../../scripts/catalog-child-baseline';
import { verifyCheckedInBaseline } from '../../scripts/generate-catalog-child-baseline';

function cloneArtifact() {
  return structuredClone(reviewedChildCatalog) as Record<string, unknown>;
}

describe('reviewed child-catalog baseline provenance', () => {
  it('verifies the complete reviewed digest, source, generator, and per-feed evidence', async () => {
    const baseline = validateReviewedChildCatalogArtifact(reviewedChildCatalog);
    const summary = summarizeChildCatalogBaseline(baseline);

    expect(summary).toMatchObject({
      reviewedParks: 96,
      reviewedChildEntities: 6_790,
      identitySha256: EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256,
      expectedIdentitySha256: EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256,
      verifiedFeedEvidence: 96,
      generatorCommand: REVIEWED_CHILD_BASELINE_COMMAND,
    });
    await expect(verifyCheckedInBaseline()).resolves.toMatchObject({
      expectedIdentitySha256: EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256,
    });
  });

  it('fails when a reviewed child identity is removed without new review evidence', () => {
    const tampered = cloneArtifact();
    const parks = tampered.parks as Record<string, string[]>;
    const parkId = Object.keys(parks).find((id) => parks[id].length > 0)!;
    parks[parkId] = parks[parkId].slice(1);

    expect(() => validateReviewedChildCatalogArtifact(tampered)).toThrow(/tampered|digest/i);
  });

  it('fails when the full reviewed digest is replaced by an unreviewed value', () => {
    const tampered = cloneArtifact();
    tampered.expectedIdentitySha256 = '0'.repeat(64);

    expect(() => validateReviewedChildCatalogArtifact(tampered)).toThrow(
      new RegExp(EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256)
    );
  });

  it('fails when source endpoint or per-feed provenance is altered', () => {
    const sourceTamper = cloneArtifact();
    (sourceTamper.source as Record<string, unknown>).childEndpointTemplate =
      'https://example.invalid/{parkId}';
    expect(() => validateReviewedChildCatalogArtifact(sourceTamper)).toThrow(/endpoint/i);

    const feedTamper = cloneArtifact();
    const feedEvidence = feedTamper.feedEvidence as Record<
      string,
      Record<string, unknown>
    >;
    const parkId = Object.keys(feedEvidence)[0];
    feedEvidence[parkId].childCount = Number(feedEvidence[parkId].childCount) + 1;
    expect(() => validateReviewedChildCatalogArtifact(feedTamper)).toThrow(/tampered/i);
  });
});
