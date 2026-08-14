#include "VantageCharacter.h"

#include "Interactable.h"
#include "InteractionProbe.h"
#include "VantageGameMode.h"

#include "TimerManager.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/SpotLightComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "InputAction.h"
#include "InputActionValue.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"

AVantageCharacter::AVantageCharacter()
{
	PrimaryActorTick.bCanEverTick = false;

	GetCapsuleComponent()->InitCapsuleSize(38.f, 92.f);

	// Yaw follows the controller, pitch stays on the camera only.
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = true;
	bUseControllerRotationRoll = false;

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = false;
	Movement->MaxWalkSpeed = WalkSpeed;
	Movement->MaxWalkSpeedCrouched = 210.f;
	Movement->JumpZVelocity = 480.f;
	Movement->AirControl = 0.35f;
	Movement->BrakingDecelerationWalking = 2000.f;
	Movement->SetCrouchedHalfHeight(55.f);
	Movement->GetNavAgentPropertiesRef().bCanCrouch = true;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(GetCapsuleComponent());
	Camera->SetRelativeLocation(FVector(0.f, 0.f, 70.f));
	Camera->bUsePawnControlRotation = true;
	Camera->FieldOfView = 95.f;

	// Held slightly right of and below the eye line so its shadows read as handheld.
	Flashlight = CreateDefaultSubobject<USpotLightComponent>(TEXT("Flashlight"));
	Flashlight->SetupAttachment(Camera);
	Flashlight->SetRelativeLocation(FVector(12.f, 10.f, -10.f));
	Flashlight->IntensityUnits = ELightUnits::Unitless;
	Flashlight->Intensity = 60000.f;
	Flashlight->AttenuationRadius = 3000.f;
	Flashlight->InnerConeAngle = 16.f;
	Flashlight->OuterConeAngle = 33.f;
	Flashlight->LightColor = FColor(255, 244, 219);
	Flashlight->CastShadows = true;
	Flashlight->SetVisibility(false);

	InteractionProbe = CreateDefaultSubobject<UInteractionProbe>(TEXT("InteractionProbe"));

	// Nothing to draw for the body in a bare first person demo.
	GetMesh()->SetVisibility(false);
}

void AVantageCharacter::PostInitializeComponents()
{
	Super::PostInitializeComponents();
	BuildInputBindings();
}

void AVantageCharacter::BeginPlay()
{
	Super::BeginPlay();

	// Cheap insurance rather than a per-frame tick: if the floor somehow was not
	// there when we spawned, this catches the fall instead of dropping forever.
	GetWorldTimerManager().SetTimer(
		FallCheckTimer, this, &AVantageCharacter::CheckForFall, 0.5f, true);

	GetWorldTimerManager().SetTimer(
		InputWatchdogTimer, this, &AVantageCharacter::ReportSilentInput, 8.f, false);
}

void AVantageCharacter::CheckForFall()
{
	if (GetActorLocation().Z > FallRecoveryZ)
	{
		return;
	}

	FVector Recovery(-480.f, 0.f, 110.f);
	if (const AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
	{
		Recovery = GameMode->GetSpawnLocation();
	}

	UE_LOG(LogTemp, Warning,
		TEXT("Vantage: player fell out of the level and was returned to %s. ")
		TEXT("If this repeats immediately, the level geometry is not being built."),
		*Recovery.ToCompactString());

	GetCharacterMovement()->StopMovementImmediately();
	SetActorLocation(Recovery, false, nullptr, ETeleportType::TeleportPhysics);
}

void AVantageCharacter::ReportSilentInput()
{
	if (bReceivedAnyInput)
	{
		return;
	}

	// Not fatal on its own - the player may simply not have touched anything -
	// but if the game feels dead this is the first place to look.
	UE_LOG(LogTemp, Warning,
		TEXT("Vantage: no input received in the first 8 seconds. If nothing responds, check that ")
		TEXT("Config/DefaultInput.ini sets DefaultPlayerInputClass and DefaultInputComponentClass ")
		TEXT("to the EnhancedInput versions, and that the EnhancedInput plugin is enabled."));
}

void AVantageCharacter::BuildInputBindings()
{
	if (InputContext)
	{
		return;
	}

	InputContext = NewObject<UInputMappingContext>(this, TEXT("VantageInputContext"));

	auto MakeAction = [this](const TCHAR* Name, EInputActionValueType Type) -> UInputAction*
	{
		UInputAction* Action = NewObject<UInputAction>(this, Name);
		Action->ValueType = Type;
		return Action;
	};

	MoveAction       = MakeAction(TEXT("IA_Move"),       EInputActionValueType::Axis2D);
	LookAction       = MakeAction(TEXT("IA_Look"),       EInputActionValueType::Axis2D);
	LookRateAction   = MakeAction(TEXT("IA_LookRate"),   EInputActionValueType::Axis2D);
	JumpAction       = MakeAction(TEXT("IA_Jump"),       EInputActionValueType::Boolean);
	SprintAction     = MakeAction(TEXT("IA_Sprint"),     EInputActionValueType::Boolean);
	CrouchAction     = MakeAction(TEXT("IA_Crouch"),     EInputActionValueType::Boolean);
	InteractAction   = MakeAction(TEXT("IA_Interact"),   EInputActionValueType::Boolean);
	FlashlightAction = MakeAction(TEXT("IA_Flashlight"), EInputActionValueType::Boolean);

	// A key press lands on the X axis, so anything that should read as
	// forward/back needs swizzling into Y first, then negating if it points the
	// other way. Modifiers apply in array order.
	auto MapAxis = [this](UInputAction* Action, const FKey& Key, bool bSwizzleToY, bool bNegate)
	{
		FEnhancedActionKeyMapping& Mapping = InputContext->MapKey(Action, Key);
		if (bSwizzleToY)
		{
			UInputModifierSwizzleAxis* Swizzle = NewObject<UInputModifierSwizzleAxis>(InputContext);
			Swizzle->Order = EInputAxisSwizzle::YXZ;
			Mapping.Modifiers.Add(Swizzle);
		}
		if (bNegate)
		{
			Mapping.Modifiers.Add(NewObject<UInputModifierNegate>(InputContext));
		}
	};

	MapAxis(MoveAction, EKeys::W, /*Swizzle*/ true,  /*Negate*/ false);
	MapAxis(MoveAction, EKeys::S, /*Swizzle*/ true,  /*Negate*/ true);
	MapAxis(MoveAction, EKeys::D, /*Swizzle*/ false, /*Negate*/ false);
	MapAxis(MoveAction, EKeys::A, /*Swizzle*/ false, /*Negate*/ true);
	MapAxis(MoveAction, EKeys::Up,    true,  false);
	MapAxis(MoveAction, EKeys::Down,  true,  true);
	MapAxis(MoveAction, EKeys::Right, false, false);
	MapAxis(MoveAction, EKeys::Left,  false, true);
	MapAxis(MoveAction, EKeys::Gamepad_LeftX, false, false);
	MapAxis(MoveAction, EKeys::Gamepad_LeftY, true,  false);

	// Mouse deltas are already frame independent; stick deflection is not, so it
	// gets its own action that Look() scales by delta time.
	InputContext->MapKey(LookAction, EKeys::Mouse2D);
	MapAxis(LookRateAction, EKeys::Gamepad_RightX, false, false);
	MapAxis(LookRateAction, EKeys::Gamepad_RightY, true,  false);

	InputContext->MapKey(JumpAction, EKeys::SpaceBar);
	InputContext->MapKey(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
	InputContext->MapKey(SprintAction, EKeys::LeftShift);
	InputContext->MapKey(SprintAction, EKeys::Gamepad_LeftThumbstick);
	InputContext->MapKey(CrouchAction, EKeys::LeftControl);
	InputContext->MapKey(CrouchAction, EKeys::C);
	InputContext->MapKey(CrouchAction, EKeys::Gamepad_FaceButton_Right);
	InputContext->MapKey(InteractAction, EKeys::E);
	InputContext->MapKey(InteractAction, EKeys::Gamepad_FaceButton_Left);
	InputContext->MapKey(FlashlightAction, EKeys::F);
	InputContext->MapKey(FlashlightAction, EKeys::Gamepad_FaceButton_Top);
}

void AVantageCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	BuildInputBindings();

	// Two things can fail here, and both fail silently by default, so each one
	// gets its own error. Between them they cover every "nothing responds to the
	// keyboard" case short of the plugin being disabled outright.
	const APlayerController* PC = Cast<APlayerController>(GetController());
	UEnhancedInputLocalPlayerSubsystem* Subsystem = PC
		? ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer())
		: nullptr;

	if (Subsystem)
	{
		Subsystem->AddMappingContext(InputContext, 0);
	}
	else
	{
		UE_LOG(LogTemp, Error,
			TEXT("Vantage: no EnhancedInputLocalPlayerSubsystem. Check that DefaultPlayerInputClass ")
			TEXT("in Config/DefaultInput.ini is /Script/EnhancedInput.EnhancedPlayerInput."));
	}

	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input)
	{
		UE_LOG(LogTemp, Error,
			TEXT("Vantage: pawn was given a plain UInputComponent. Set DefaultInputComponentClass ")
			TEXT("in Config/DefaultInput.ini to /Script/EnhancedInput.EnhancedInputComponent."));
		return;
	}

	Input->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AVantageCharacter::Move);
	Input->BindAction(LookAction, ETriggerEvent::Triggered, this, &AVantageCharacter::Look);
	Input->BindAction(LookRateAction, ETriggerEvent::Triggered, this, &AVantageCharacter::LookRate);
	Input->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
	Input->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
	Input->BindAction(SprintAction, ETriggerEvent::Started, this, &AVantageCharacter::StartSprint);
	Input->BindAction(SprintAction, ETriggerEvent::Completed, this, &AVantageCharacter::StopSprint);
	Input->BindAction(CrouchAction, ETriggerEvent::Started, this, &AVantageCharacter::ToggleCrouch);
	Input->BindAction(InteractAction, ETriggerEvent::Started, this, &AVantageCharacter::TryInteract);
	Input->BindAction(FlashlightAction, ETriggerEvent::Started, this, &AVantageCharacter::ToggleFlashlight);
}

void AVantageCharacter::Move(const FInputActionValue& Value)
{
	bReceivedAnyInput = true;

	const FVector2D Axis = Value.Get<FVector2D>();
	if (!Controller || Axis.IsNearlyZero())
	{
		return;
	}

	// Movement is flattened to the yaw plane so looking up does not slow you down.
	const FRotator YawOnly(0.f, Controller->GetControlRotation().Yaw, 0.f);
	const FRotationMatrix YawFrame(YawOnly);

	AddMovementInput(YawFrame.GetUnitAxis(EAxis::X), Axis.Y);
	AddMovementInput(YawFrame.GetUnitAxis(EAxis::Y), Axis.X);
}

void AVantageCharacter::Look(const FInputActionValue& Value)
{
	bReceivedAnyInput = true;

	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X * MouseSensitivity);
	AddControllerPitchInput(-Axis.Y * MouseSensitivity);
}

void AVantageCharacter::LookRate(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	const float Delta = GetWorld() ? GetWorld()->GetDeltaSeconds() : 0.f;

	AddControllerYawInput(Axis.X * GamepadLookRate * Delta);
	AddControllerPitchInput(-Axis.Y * GamepadLookRate * Delta);
}

void AVantageCharacter::StartSprint()
{
	GetCharacterMovement()->MaxWalkSpeed = SprintSpeed;
}

void AVantageCharacter::StopSprint()
{
	GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;
}

void AVantageCharacter::ToggleCrouch()
{
	if (bIsCrouched)
	{
		UnCrouch();
	}
	else
	{
		Crouch();
	}
}

void AVantageCharacter::TryInteract()
{
	if (!InteractionProbe)
	{
		return;
	}

	AActor* Focused = InteractionProbe->GetFocusedActor();
	IInteractable* Interactable = Cast<IInteractable>(Focused);
	if (!Interactable || !Interactable->CanInteract(this))
	{
		return;
	}

	Interactable->Interact(this);
}

void AVantageCharacter::ToggleFlashlight()
{
	if (Flashlight)
	{
		Flashlight->ToggleVisibility();
	}
}
