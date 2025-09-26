import { useKV } from '@github/spark/hooks'
import { useState, useCallback } from 'react'
import type { WaitTimeReport, Verification, UserContribution } from '@/types'

export function useReporting() {
  const [reports, setReports] = useKV<WaitTimeReport[]>('wait-time-reports', [])
  const [verifications, setVerifications] = useKV<Verification[]>('verifications', [])
  const [contributions, setContributions] = useKV<UserContribution[]>('user-contributions', [])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Submit a new wait time report
  const submitReport = useCallback(async (
    attractionId: string,
    parkId: string,
    userId: string,
    username: string,
    waitTime: number
  ) => {
    setIsSubmitting(true)
    
    try {
      const newReport: WaitTimeReport = {
        id: `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        attractionId,
        parkId,
        userId,
        username,
        waitTime,
        reportedAt: new Date().toISOString(),
        verifications: [],
        status: 'pending'
      }

      await setReports(current => [...(current || []), newReport])

      // Update user contributions
      await setContributions(current => {
        const contributions = current || []
        const userIndex = contributions.findIndex(c => c.userId === userId)
        if (userIndex >= 0) {
          const updated = [...contributions]
          updated[userIndex] = {
            ...updated[userIndex],
            reportsSubmitted: updated[userIndex].reportsSubmitted + 1
          }
          return updated
        } else {
          return [...contributions, {
            userId,
            reportsSubmitted: 1,
            verificationsProvided: 0,
            accuracyScore: 0,
            trustLevel: 'new' as const,
            badges: ['first-report']
          }]
        }
      })

      return newReport
    } finally {
      setIsSubmitting(false)
    }
  }, [setReports, setContributions])

  // Verify an existing report
  const verifyReport = useCallback(async (
    reportId: string,
    userId: string,
    username: string,
    isAccurate: boolean,
    reportedWaitTime?: number,
    confidence: 'low' | 'medium' | 'high' = 'medium'
  ) => {
    const newVerification: Verification = {
      id: `verification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      username,
      reportId,
      isAccurate,
      reportedWaitTime,
      verifiedAt: new Date().toISOString(),
      confidence
    }

    await setVerifications(current => [...(current || []), newVerification])

    // Update the report with the new verification
    await setReports(current => {
      const reports = current || []
      return reports.map(report => {
        if (report.id === reportId) {
          const updatedVerifications = [...report.verifications, newVerification]
          const accuracy = calculateAccuracy(updatedVerifications)
          const status = determineReportStatus(updatedVerifications, accuracy)
          
          return {
            ...report,
            verifications: updatedVerifications,
            accuracy,
            status
          }
        }
        return report
      })
    })

    // Update user contributions
    await setContributions(current => {
      const contributions = current || []
      const userIndex = contributions.findIndex(c => c.userId === userId)
      if (userIndex >= 0) {
        const updated = [...contributions]
        updated[userIndex] = {
          ...updated[userIndex],
          verificationsProvided: updated[userIndex].verificationsProvided + 1
        }
        return updated
      } else {
        return [...contributions, {
          userId,
          reportsSubmitted: 0,
          verificationsProvided: 1,
          accuracyScore: 0,
          trustLevel: 'new' as const,
          badges: ['first-verification']
        }]
      }
    })

    return newVerification
  }, [setVerifications, setReports, setContributions])

  // Get recent reports for an attraction
  const getRecentReports = useCallback((attractionId: string, limit: number = 10) => {
    const allReports = reports || []
    return allReports
      .filter(report => report.attractionId === attractionId)
      .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
      .slice(0, limit)
  }, [reports])

  // Calculate consensus wait time for an attraction
  const getConsensusWaitTime = useCallback((attractionId: string) => {
    const recentReports = getRecentReports(attractionId, 20)
    if (recentReports.length === 0) return null

    // Filter for recent reports (last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
    const veryRecentReports = recentReports.filter(
      report => new Date(report.reportedAt) > thirtyMinutesAgo
    )

    if (veryRecentReports.length === 0) return null

    // Weight reports by verification status and user trust level
    let weightedSum = 0
    let totalWeight = 0

    veryRecentReports.forEach(report => {
      let weight = 1

      // Increase weight for verified reports
      if (report.status === 'verified') weight *= 1.5
      if (report.accuracy && report.accuracy > 0.8) weight *= 1.3

      // Get user trust level and adjust weight
      const userContrib = (contributions || []).find(c => c.userId === report.userId)
      if (userContrib) {
        const trustMultiplier = {
          'new': 0.8,
          'bronze': 1.0,
          'silver': 1.2,
          'gold': 1.4,
          'platinum': 1.6
        }[userContrib.trustLevel]
        weight *= trustMultiplier
      }

      weightedSum += report.waitTime * weight
      totalWeight += weight
    })

    return Math.round(weightedSum / totalWeight)
  }, [reports, contributions, getRecentReports])

  return {
    reports,
    verifications,
    contributions,
    isSubmitting,
    submitReport,
    verifyReport,
    getRecentReports,
    getConsensusWaitTime
  }
}

// Helper functions
function calculateAccuracy(verifications: Verification[]): number {
  if (verifications.length === 0) return 0
  
  const accurateCount = verifications.filter(v => v.isAccurate).length
  return accurateCount / verifications.length
}

function determineReportStatus(verifications: Verification[], accuracy: number): 'pending' | 'verified' | 'disputed' {
  if (verifications.length < 2) return 'pending'
  
  if (accuracy >= 0.7) return 'verified'
  if (accuracy <= 0.3) return 'disputed'
  return 'pending'
}