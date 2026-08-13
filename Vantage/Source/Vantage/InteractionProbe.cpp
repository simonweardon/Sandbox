#include "InteractionProbe.h"

#include "Interactable.h"
#include "VantageCharacter.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"

UInteractionProbe::UInteractionProbe()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void UInteractionProbe::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	FocusedActor = nullptr;
	bFocusLocked = false;

	const APawn* Pawn = Cast<APawn>(GetOwner());
	if (!Pawn)
	{
		return;
	}

	const APlayerController* PC = Cast<APlayerController>(Pawn->GetController());
	if (!PC)
	{
		return;
	}

	// GetPlayerViewPoint gives us the camera transform after any modifiers,
	// so the trace always agrees with what is actually drawn behind the crosshair.
	FVector ViewLocation;
	FRotator ViewRotation;
	PC->GetPlayerViewPoint(ViewLocation, ViewRotation);

	FCollisionQueryParams Params(SCENE_QUERY_STAT(InteractionProbe), false, GetOwner());
	Params.AddIgnoredActor(GetOwner());

	FHitResult Hit;
	const bool bHit = GetWorld()->LineTraceSingleByChannel(
		Hit,
		ViewLocation,
		ViewLocation + ViewRotation.Vector() * Reach,
		ECC_Visibility,
		Params);

	if (!bHit)
	{
		return;
	}

	AActor* HitActor = Hit.GetActor();
	const IInteractable* Interactable = Cast<IInteractable>(HitActor);
	if (!Interactable)
	{
		return;
	}

	FocusedActor = HitActor;
	bFocusLocked = !Interactable->CanInteract(Cast<AVantageCharacter>(GetOwner()));
}

FText UInteractionProbe::GetFocusedPrompt() const
{
	if (const IInteractable* Interactable = Cast<IInteractable>(FocusedActor.Get()))
	{
		return Interactable->GetInteractionPrompt();
	}
	return FText::GetEmpty();
}
