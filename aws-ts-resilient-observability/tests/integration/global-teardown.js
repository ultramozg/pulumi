/**
 * Global teardown for integration tests
 * Runs once after all test suites complete
 */

const { CleanupManager } = require('./cleanup-manager');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('🧹 Global integration test teardown starting...');
  
  try {
    // Perform final cleanup of any remaining resources
    const cleanupManager = new CleanupManager();
    const resourceCounts = cleanupManager.getResourceCounts();
    const totalResources = Object.values(resourceCounts).reduce((sum, count) => sum + count, 0);
    
    if (totalResources > 0) {
      console.log(`🧹 Cleaning up ${totalResources} remaining resources...`);
      await cleanupManager.cleanupAll({ forceCleanup: true });
    }
    
    // Clean up temporary test workspaces
    const workspacesDir = path.join(__dirname, 'workspaces');
    if (fs.existsSync(workspacesDir)) {
      console.log('🗑️  Removing temporary workspaces...');
      fs.rmSync(workspacesDir, { recursive: true, force: true });
    }
    
    // Clean up cleanup registry file
    const cleanupFile = path.join(__dirname, '.cleanup-registry.json');
    if (fs.existsSync(cleanupFile)) {
      fs.unlinkSync(cleanupFile);
    }
    
    console.log('✅ Global integration test teardown completed');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't fail the entire test suite due to cleanup issues
  }
};