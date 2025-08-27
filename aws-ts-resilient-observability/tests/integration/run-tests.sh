#!/bin/bash

# Integration Test Runner Script
# Provides convenient commands for running integration tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if AWS CLI is installed and configured
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if AWS credentials are configured
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured. Please configure them first."
        exit 1
    fi
    
    # Check if Pulumi is installed
    if ! command -v pulumi &> /dev/null; then
        print_error "Pulumi CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if Node.js and npm are installed
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        print_error "Node.js and npm are required. Please install them first."
        exit 1
    fi
    
    print_success "All prerequisites are met"
}

# Function to set up environment
setup_environment() {
    print_status "Setting up test environment..."
    
    # Set default AWS region if not set
    if [ -z "$AWS_REGION" ]; then
        export AWS_REGION="us-east-1"
        print_status "Set AWS_REGION to us-east-1"
    fi
    
    # Check if we're in a safe environment (not production)
    if [ "$AWS_PROFILE" = "production" ] || [ "$NODE_ENV" = "production" ]; then
        print_error "Integration tests should not run against production environment"
        exit 1
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm install
    fi
    
    print_success "Environment setup completed"
}

# Function to run cleanup
run_cleanup() {
    print_status "Running cleanup of test resources..."
    
    # Run the cleanup script
    node -e "
        const { CleanupManager } = require('./cleanup-manager');
        const cleanupManager = new CleanupManager();
        cleanupManager.cleanupAll({ forceCleanup: true })
            .then(() => console.log('Cleanup completed'))
            .catch(err => console.error('Cleanup failed:', err));
    "
    
    print_success "Cleanup completed"
}

# Function to show usage
show_usage() {
    echo "Integration Test Runner"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  all                    Run all integration tests"
    echo "  vpc-ipam              Run VPC + IPAM integration tests"
    echo "  vpc-tgw               Run VPC + Transit Gateway integration tests"
    echo "  multi-component       Run multi-component deployment tests"
    echo "  cleanup               Clean up test resources"
    echo "  check                 Check prerequisites"
    echo "  help                  Show this help message"
    echo ""
    echo "Options:"
    echo "  --coverage            Run with coverage reporting"
    echo "  --watch               Run in watch mode"
    echo "  --verbose             Run with verbose output"
    echo "  --dry-run             Show what would be run without executing"
    echo ""
    echo "Environment Variables:"
    echo "  AWS_REGION            AWS region for testing (default: us-east-1)"
    echo "  AWS_PROFILE           AWS profile to use"
    echo "  PULUMI_CONFIG_PASSPHRASE  Pulumi config passphrase"
    echo ""
    echo "Examples:"
    echo "  $0 all                Run all integration tests"
    echo "  $0 vpc-ipam --coverage Run VPC+IPAM tests with coverage"
    echo "  $0 cleanup            Clean up test resources"
}

# Parse command line arguments
COMMAND=""
COVERAGE=""
WATCH=""
VERBOSE=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case $1 in
        all|vpc-ipam|vpc-tgw|multi-component|cleanup|check|help)
            COMMAND="$1"
            shift
            ;;
        --coverage)
            COVERAGE="--coverage"
            shift
            ;;
        --watch)
            WATCH="--watch"
            shift
            ;;
        --verbose)
            VERBOSE="--verbose"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
case $COMMAND in
    check)
        check_prerequisites
        ;;
    cleanup)
        run_cleanup
        ;;
    help|"")
        show_usage
        ;;
    all)
        check_prerequisites
        setup_environment
        
        if [ "$DRY_RUN" = "true" ]; then
            print_status "Would run: npm run test:integration $COVERAGE $WATCH $VERBOSE"
        else
            print_status "Running all integration tests..."
            npm run test:integration $COVERAGE $WATCH $VERBOSE
            print_success "All integration tests completed"
        fi
        ;;
    vpc-ipam)
        check_prerequisites
        setup_environment
        
        if [ "$DRY_RUN" = "true" ]; then
            print_status "Would run: npx jest --config jest.integration.config.js vpc-ipam.test.ts $COVERAGE $VERBOSE"
        else
            print_status "Running VPC + IPAM integration tests..."
            npx jest --config jest.integration.config.js vpc-ipam.test.ts $COVERAGE $VERBOSE
            print_success "VPC + IPAM integration tests completed"
        fi
        ;;
    vpc-tgw)
        check_prerequisites
        setup_environment
        
        if [ "$DRY_RUN" = "true" ]; then
            print_status "Would run: npx jest --config jest.integration.config.js vpc-transitgateway.test.ts $COVERAGE $VERBOSE"
        else
            print_status "Running VPC + Transit Gateway integration tests..."
            npx jest --config jest.integration.config.js vpc-transitgateway.test.ts $COVERAGE $VERBOSE
            print_success "VPC + Transit Gateway integration tests completed"
        fi
        ;;
    multi-component)
        check_prerequisites
        setup_environment
        
        if [ "$DRY_RUN" = "true" ]; then
            print_status "Would run: npx jest --config jest.integration.config.js multi-component-deployment.test.ts $COVERAGE $VERBOSE"
        else
            print_status "Running multi-component deployment tests..."
            npx jest --config jest.integration.config.js multi-component-deployment.test.ts $COVERAGE $VERBOSE
            print_success "Multi-component deployment tests completed"
        fi
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_usage
        exit 1
        ;;
esac