import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-add-employee',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-employee.component.html',
})
export class AddEmployeeComponent {
  @Output() close = new EventEmitter<void>();

  currentStep = 1;
  totalSteps = 5;

  // Step 1: Personal Details
  personalDetails = {
    firstName: '',
    lastName: '',
    middleName: '',
    employeeId: '',
    employmentType: '',
    dateOfBirth: '',
    joiningDate: '',
    nationality: '',
    maritalStatus: '',
    phoneNumber: '',
    email: '',
    address: ''
  };

  // Step 2: Employment Details
  employmentDetails = {
    department: '',
    jobTitle: '',
    reportingManager: '',
    workLocation: '',
    employeeType: '',
    workSchedule: '',
    probationPeriod: '',
    contractEndDate: ''
  };

  // Step 3: Compensation & Benefits
  compensationDetails = {
    basicSalary: '',
    payFrequency: '',
    bankName: '',
    accountNumber: '',
    taxId: '',
    healthInsurance: '',
    retirementPlan: '',
    bonus: ''
  };

  // Step 4: Onboarding Checklist
  onboardingChecklist = {
    welcomeEmail: false,
    itSetup: false,
    accessCards: false,
    workstation: false,
    orientationScheduled: false,
    mentorAssigned: false,
    policiesAcknowledged: false,
    emergencyContact: false
  };

  // Step 5: Documents
  documents = {
    resume: null as File | null,
    idProof: null as File | null,
    addressProof: null as File | null,
    educationCertificates: null as File | null,
    previousEmployment: null as File | null,
    bankDetails: null as File | null
  };

  // Dropdown Options
  employmentTypes = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'];
  nationalities = ['Nigerian', 'American', 'British', 'Canadian', 'Indian', 'Ghanaian', 'South African', 'Other'];
  maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
  departments = ['Engineering', 'Design', 'Marketing', 'Sales', 'Human Resources', 'Finance', 'Operations', 'Customer Support'];
  workLocations = ['Lagos Office', 'Abuja Office', 'Remote', 'Hybrid'];
  workSchedules = ['9 AM - 5 PM', '10 AM - 6 PM', 'Flexible', 'Shift-based'];
  payFrequencies = ['Monthly', 'Bi-weekly', 'Weekly'];
  healthInsuranceOptions = ['Basic Plan', 'Premium Plan', 'Family Plan', 'None'];
  retirementPlans = ['Pension Fund', '401k Equivalent', 'None'];

  managers = [
    { id: 1, name: 'John Smith' },
    { id: 2, name: 'Sarah Johnson' },
    { id: 3, name: 'Michael Brown' },
    { id: 4, name: 'Emily Davis' }
  ];

  errors: { [key: string]: string } = {};

  goToStep(step: number) {
    if (step >= 1 && step <= this.totalSteps) {
      if (step > this.currentStep) {
        if (this.validateCurrentStep()) {
          this.currentStep = step;
        }
      } else {
        this.currentStep = step;
      }
    }
  }

  nextStep() {
    if (this.validateCurrentStep()) {
      if (this.currentStep < this.totalSteps) {
        this.currentStep++;
      }
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  validateCurrentStep(): boolean {
    this.errors = {};

    switch (this.currentStep) {
      case 1:
        if (!this.personalDetails.firstName.trim()) {
          this.errors['firstName'] = 'First name is required';
        }
        if (!this.personalDetails.lastName.trim()) {
          this.errors['lastName'] = 'Last name is required';
        }
        if (!this.personalDetails.phoneNumber.trim()) {
          this.errors['phoneNumber'] = 'Phone number is required';
        }
        break;

      case 2:
        if (!this.employmentDetails.department) {
          this.errors['department'] = 'Department is required';
        }
        if (!this.employmentDetails.jobTitle.trim()) {
          this.errors['jobTitle'] = 'Job title is required';
        }
        break;

      case 3:
        if (!this.compensationDetails.basicSalary.trim()) {
          this.errors['basicSalary'] = 'Basic salary is required';
        }
        if (!this.compensationDetails.payFrequency) {
          this.errors['payFrequency'] = 'Pay frequency is required';
        }
        break;
    }

    return Object.keys(this.errors).length === 0;
  }

  onFileSelect(event: Event, field: keyof typeof this.documents) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.documents[field] = input.files[0];
    }
  }

  submitForm() {
    if (this.validateCurrentStep()) {
      console.log('Form submitted:', {
        personalDetails: this.personalDetails,
        employmentDetails: this.employmentDetails,
        compensationDetails: this.compensationDetails,
        onboardingChecklist: this.onboardingChecklist,
        documents: this.documents
      });
      alert('Employee added successfully!');
      this.close.emit();
    }
  }

  onClose() {
    this.close.emit();
  }
}
